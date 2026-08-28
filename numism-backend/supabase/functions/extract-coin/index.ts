// See coin_app_requirements.md §5.2, §3.7. Holds GEMINI_API_KEY as a secret
// env var (set via `supabase secrets set`) — never exposed to the client.
// Takes both the front (obverse) and back (reverse) photo as multipart form
// fields, since mint marks/dates/commemorative details can be on either side.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { callGemini, callGeminiMintMatch, type CoinImage } from "../_shared/coin-schema.ts";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const form = await req.formData();
    const frontFile = form.get("front") as File | null;
    const backFile = form.get("back") as File | null;
    if (!frontFile || !backFile) {
      return Response.json({ error: "front and back images are both required" }, { status: 400 });
    }
    const front: CoinImage = { bytes: await frontFile.arrayBuffer(), mimeType: frontFile.type || "image/jpeg" };
    const back: CoinImage = { bytes: await backFile.arrayBuffer(), mimeType: backFile.type || "image/jpeg" };

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

    try {
      const { image_quality_score, ...fields } = await callGemini(apiKey, front, back);

      // §3.7: if we already have known mint marks on file for this country,
      // re-examine the image constrained to that set instead of trusting
      // the free-text first-pass guess.
      const { data: knownMintRows, error: mintsError } = await ctx.supabaseAdmin
        .from("mints")
        .select("mint_mark")
        .ilike("country", fields.country.trim());
      if (mintsError) return Response.json({ error: mintsError.message }, { status: 500 });

      const knownMarks = [...new Set((knownMintRows ?? []).map((m) => m.mint_mark))];
      if (knownMarks.length > 0) {
        fields.mint_mark = await callGeminiMintMatch(apiKey, front, back, fields.country, knownMarks);
      }

      let mint_id: number | null = null;
      let mint_name: string | null = null;
      let mark_image_url: string | null = null;
      if (fields.mint_mark) {
        const { data: mint, error: mintError } = await ctx.supabaseAdmin
          .from("mints")
          .select("id, mint_name, mark_image_path")
          .ilike("country", fields.country.trim())
          .ilike("mint_mark", fields.mint_mark.trim())
          .maybeSingle();
        if (mintError) return Response.json({ error: mintError.message }, { status: 500 });
        mint_id = mint?.id ?? null;
        mint_name = mint?.mint_name ?? null;
        if (mint?.mark_image_path) {
          mark_image_url =
            (await ctx.supabaseAdmin.storage.from("mint-marks").createSignedUrl(mint.mark_image_path, 3600)).data
              ?.signedUrl ?? null;
        }
      }

      return Response.json({ fields, image_quality_score, mint_id, mint_name, mark_image_url });
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 502 });
    }
  }),
};
