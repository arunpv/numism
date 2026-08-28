// Shared Gemini logic for coin extraction (see coin_app_requirements.md §3.2, §3.7, §5.2).
export const COIN_SCHEMA = {
  type: "object",
  properties: {
    country: { type: "string" },
    denomination: { type: "string" },
    mint_year: { type: "integer", nullable: true },
    mint_mark: { type: "string", nullable: true },
    commemorative_theme: {
      type: "string",
      nullable: true,
      description:
        "If this is a commemorative/special-issue coin (distinct design/theme from the standard circulation " +
        "coin of this denomination), a short name for the theme/inscription (e.g. 'Kew Gardens', '75th " +
        "Anniversary of D-Day'). Null for an ordinary circulation coin.",
    },
    image_quality_score: { type: "integer", description: "Clarity/quality estimate 0-100" },
  },
  required: ["country", "denomination", "mint_year", "mint_mark", "commemorative_theme", "image_quality_score"],
};

export type CoinImage = { bytes: ArrayBuffer; mimeType: string };

// Spreading a large typed array as function arguments (the old
// `String.fromCharCode(...bytes)` approach) blows V8's call stack once the
// image is more than ~64KB — compressed coin photos routinely run 150-300KB,
// so this must chunk instead.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function callGeminiRaw(
  apiKey: string,
  images: CoinImage[],
  prompt: string,
  // deno-lint-ignore no-explicit-any
  responseSchema: any,
) {
  const imageParts = images.map((img) => ({
    inline_data: { mime_type: img.mimeType, data: arrayBufferToBase64(img.bytes) },
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, ...imageParts],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return JSON.parse(text);
}

// First pass: free-text extraction, mint_mark is a best-effort guess.
// Takes both the front (obverse) and back (reverse) photos — mint marks,
// commemorative themes, and dates can appear on either side depending on
// the country/coin, so both are always sent together.
export async function callGemini(apiKey: string, front: CoinImage, back: CoinImage) {
  return callGeminiRaw(
    apiKey,
    [front, back],
    "These two images are the front (obverse) and back (reverse) of the same coin. Identify this coin. " +
      "Return its country of origin, denomination, mint year, mint mark (if visible on either side), " +
      "whether it's a commemorative/special-issue design and if so its theme, and a 0-100 estimate of how " +
      "clear/legible the coin details are across both photos.",
    COIN_SCHEMA,
  );
}

// Second pass (§3.7): re-examine the mint mark constrained to the set of
// marks already on file for this country, so the result is guaranteed to
// either exactly match a `mints` row or come back null — no free-text guess
// to fuzzy-match later. Only called when `knownMarks` is non-empty.
export async function callGeminiMintMatch(
  apiKey: string,
  front: CoinImage,
  back: CoinImage,
  country: string,
  knownMarks: string[],
) {
  const schema = {
    type: "object",
    properties: {
      mint_mark: {
        type: "string",
        nullable: true,
        enum: [...knownMarks, null],
        description: "Must be exactly one of the known marks, or null if none match / not legible.",
      },
    },
    required: ["mint_mark"],
  };

  const result = await callGeminiRaw(
    apiKey,
    [front, back],
    `These two images are the front and back of a coin from ${country}. The known mint marks for this ` +
      `country are: ${knownMarks.join(", ")}. Look closely at both sides of the coin and determine which of ` +
      "these mint marks (if any) appears on it. A mark may be a letter or a shape (circle, diamond, star, " +
      "dot, etc). If none of the listed marks are present or legible, respond with null rather than guessing.",
    schema,
  );
  return result.mint_mark as string | null;
}
