// See coin_app_requirements.md §6 — detail view with edit is now in scope.
// Fetches one coin with resolved mint/album names and both signed photo URLs.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const { id } = await req.json();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const { data: coin, error } = await ctx.supabaseAdmin
      .from("personal_coins")
      .select("*, mints(mint_name), albums(name)")
      .eq("id", id)
      .single();
    if (error) return Response.json({ error: error.message }, { status: 404 });

    const thumbnail_url = (await ctx.supabaseAdmin.storage.from("coin-photos").createSignedUrl(coin.image_path, 3600))
      .data?.signedUrl ?? null;
    const back_thumbnail_url = coin.image_path_back
      ? (await ctx.supabaseAdmin.storage.from("coin-photos").createSignedUrl(coin.image_path_back, 3600)).data
          ?.signedUrl ?? null
      : null;

    return Response.json({ data: { ...coin, thumbnail_url, back_thumbnail_url } });
  }),
};
