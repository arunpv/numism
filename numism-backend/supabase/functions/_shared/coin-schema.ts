// Shared Gemini logic for coin extraction (see coin_app_requirements.md §3.2, §3.7, §5.2).

// Fields Gemini can estimate from the two photos beyond bare identification:
// physical/reference details plus a rarity/valuation/condition assessment.
// Shared between the capture-time extraction schema and the standalone
// re-assessment schema used when identity fields change later.
export const ASSESSMENT_SCHEMA_PROPERTIES = {
  period: {
    type: "string",
    nullable: true,
    description: "Historical period/era this coin belongs to (e.g. 'Ancient Rome', 'Victorian', 'Modern').",
  },
  value: { type: "number", nullable: true, description: "Numeric face value of the coin, e.g. 0.25." },
  currency: {
    type: "string",
    nullable: true,
    description: "Name of the currency unit, e.g. 'Dollar', 'Rupee', 'Paise', 'Cent', 'Pound', 'Pence'.",
  },
  composition: { type: "string", nullable: true, description: "Metal or alloy composition, e.g. 'Copper-Nickel'." },
  weight_grams: { type: "number", nullable: true, description: "Estimated weight in grams, based on known specs for this coin type." },
  diameter_mm: { type: "number", nullable: true, description: "Estimated diameter in millimeters." },
  thickness_mm: { type: "number", nullable: true, description: "Estimated thickness in millimeters." },
  shape: { type: "string", nullable: true, description: "Coin shape, e.g. 'Round', 'Scalloped', 'Square'." },
  orientation: {
    type: "string",
    nullable: true,
    description: "Die alignment of the coin, e.g. 'Coin alignment', 'Medal alignment'.",
  },
  rarity: { type: "string", nullable: true, description: "Rarity category, e.g. 'Common', 'Scarce', 'Rare'." },
  estimated_value_low: { type: "number", nullable: true, description: "Low end of estimated market value (USD)." },
  estimated_value_high: { type: "number", nullable: true, description: "High end of estimated market value (USD)." },
  grade: {
    type: "string",
    nullable: true,
    description: "Estimated condition grade from the images, e.g. 'MS-63', 'VF-30', 'Good'.",
  },
};

export const ASSESSMENT_SCHEMA = {
  type: "object",
  properties: ASSESSMENT_SCHEMA_PROPERTIES,
  required: Object.keys(ASSESSMENT_SCHEMA_PROPERTIES),
};

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
    ...ASSESSMENT_SCHEMA_PROPERTIES,
    demonetized: { type: "boolean", description: "True if this coin/denomination is no longer legal tender." },
    image_quality_score: { type: "integer", description: "Clarity/quality estimate 0-100" },
  },
  required: [
    "country",
    "denomination",
    "mint_year",
    "mint_mark",
    "commemorative_theme",
    ...Object.keys(ASSESSMENT_SCHEMA_PROPERTIES),
    "demonetized",
    "image_quality_score",
  ],
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
      "whether it's a commemorative/special-issue design and if so its theme, a 0-100 estimate of how " +
      "clear/legible the coin details are across both photos, and your best estimate of its historical " +
      "period, face value, currency unit, metal composition, weight/diameter/thickness, shape, die " +
      "orientation, whether it's demonetized, and an assessment of its rarity, condition grade, and " +
      "estimated market value range — base physical estimates on known specs for this coin type where the " +
      "photos alone aren't conclusive.",
    COIN_SCHEMA,
  );
}

// Re-assessment only (rarity/period/value/grade/etc), used when a coin's
// identity fields change after the initial capture and the AI estimate needs
// to be refreshed against the coin's already-stored photos.
export async function callGeminiAssessment(
  apiKey: string,
  front: CoinImage,
  back: CoinImage,
  country: string,
  denomination: string,
) {
  return callGeminiRaw(
    apiKey,
    [front, back],
    `These two images are the front and back of a ${denomination} coin from ${country}. Assess its historical ` +
      "period, face value, currency unit, metal composition, weight/diameter/thickness, shape, die " +
      "orientation, rarity, condition grade, and estimated market value range — base physical estimates on " +
      "known specs for this coin type where the photos alone aren't conclusive.",
    ASSESSMENT_SCHEMA,
  );
}

// Second pass (§3.7): re-examine the mint mark constrained to the set of
// marks already on file for this country, so the result is guaranteed to
// either exactly match a known mark or come back null — no free-text guess
// to fuzzy-match later. Only called when `knownMarks` is non-empty. Also
// asks for the mark's position relative to a digit of the year, since some
// marks mean different mints depending on placement (e.g. India's "★" below
// the first vs last digit of the year) — irrelevant for most marks, so the
// model is told to leave it null unless that's specifically what
// distinguishes the mint.
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
      mint_mark_position: {
        type: "string",
        nullable: true,
        enum: ["first_digit", "last_digit", null],
        description:
          "Only set this if the mark sits directly below (or beside, in the same position numismatists " +
          "describe as 'below') a specific digit of the mint year, AND that exact placement is what would " +
          "distinguish which mint struck the coin — not just where the mark happens to be. Leave null for " +
          "the common case where the mark's meaning doesn't depend on its position.",
      },
    },
    required: ["mint_mark", "mint_mark_position"],
  };

  const result = await callGeminiRaw(
    apiKey,
    [front, back],
    `These two images are the front and back of a coin from ${country}. The known mint marks for this ` +
      `country are: ${knownMarks.join(", ")}. Look closely at both sides of the coin and determine which of ` +
      "these mint marks (if any) appears on it. A mark may be a letter or a shape (circle, diamond, star, " +
      "dot, etc). If none of the listed marks are present or legible, respond with null rather than guessing. " +
      "Also determine whether the mark's position relative to a digit of the mint year is meaningful here.",
    schema,
  );
  return {
    mint_mark: result.mint_mark as string | null,
    mint_mark_position: result.mint_mark_position as "first_digit" | "last_digit" | null,
  };
}
