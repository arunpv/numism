// Read-only list of the saved collection (coin_app_requirements.md §6 —
// "list/search view ... near-term follow-up"). Resolves the mint/album
// names via the FKs and a signed thumbnail for the front photo.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (_req, ctx) => {
    const { data, error } = await ctx.supabaseAdmin
      .from("personal_coins")
      .select("*, mints(mint_name), albums(name)")
      .order("created_at", { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const withThumbs = await Promise.all(
      (data ?? []).map(async (c) => ({
        ...c,
        thumbnail_url: (await ctx.supabaseAdmin.storage.from("coin-photos").createSignedUrl(c.image_path, 3600))
          .data?.signedUrl ?? null,
      })),
    );

    return Response.json({ data: withThumbs });
  }),
};
