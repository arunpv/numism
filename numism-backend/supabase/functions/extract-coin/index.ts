// See coin_app_requirements.md §5.2, §3.7. Holds GEMINI_API_KEY as a secret
// env var (set via `supabase secrets set`) — never exposed to the client.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { callGemini, callGeminiMintMatch } from "../_shared/coin-schema.ts";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const mimeType = req.headers.get("content-type") || "image/jpeg";
    const imageBytes = await req.arrayBuffer();

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

    try {
      const { image_quality_score, ...fields } = await callGemini(apiKey, imageBytes, mimeType);

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
        fields.mint_mark = await callGeminiMintMatch(apiKey, imageBytes, mimeType, fields.country, knownMarks);
      }

      let mint_id: number | null = null;
      let mint_name: string | null = null;
      if (fields.mint_mark) {
        const { data: mint, error: mintError } = await ctx.supabaseAdmin
          .from("mints")
          .select("id, mint_name")
          .ilike("country", fields.country.trim())
          .ilike("mint_mark", fields.mint_mark.trim())
          .maybeSingle();
        if (mintError) return Response.json({ error: mintError.message }, { status: 500 });
        mint_id = mint?.id ?? null;
        mint_name = mint?.mint_name ?? null;
      }

      return Response.json({ fields, image_quality_score, mint_id, mint_name });
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 502 });
    }
  }),
};
