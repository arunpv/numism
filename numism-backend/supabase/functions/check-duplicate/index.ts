// See coin_app_requirements.md §3.5, §5.3. Matches on country+denomination+
// mint_year+mint_mark+commemorative_theme (nulls match nulls) — a heuristic
// flag, not a DB constraint. commemorative_theme is part of the match key so
// a commemorative doesn't collide with the plain circulation coin (or with a
// different commemorative design) from the same country/denomination/year.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const { country, denomination, mint_year, mint_mark, commemorative_theme } = await req.json();

    let query = ctx.supabaseAdmin
      .from("personal_coins")
      .select(
        "id, image_path, image_quality_score, personal_notes, quantity, album_id, page_number, pocket_number",
      )
      .eq("country", country)
      .eq("denomination", denomination);

    query = mint_year == null ? query.is("mint_year", null) : query.eq("mint_year", mint_year);
    query = mint_mark == null ? query.is("mint_mark", null) : query.eq("mint_mark", mint_mark);
    query = commemorative_theme == null
      ? query.is("commemorative_theme", null)
      : query.eq("commemorative_theme", commemorative_theme);

    const { data: matches, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Resolve short-lived signed URLs for thumbnails before returning.
    const withThumbs = await Promise.all(
      matches.map(async (m) => ({
        ...m,
        thumbnail_url: (await ctx.supabaseAdmin.storage.from("coin-photos").createSignedUrl(m.image_path, 3600))
          .data?.signedUrl,
      })),
    );

    return Response.json({ matches: withThumbs });
  }),
};
