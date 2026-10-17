// See coin_app_requirements.md §6 — deletes one coin row, e.g. a duplicate
// saved by mistake. Duplicates share one stored photo (§3.5), so the photo
// files are only removed once no other row still points at them.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const { id } = await req.json();
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const { data: coin, error: deleteError } = await ctx.supabaseAdmin
      .from("personal_coins")
      .delete()
      .eq("id", id)
      .select("image_path, image_path_back")
      .maybeSingle();
    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
    if (!coin) return Response.json({ error: "Coin not found" }, { status: 404 });

    const { count, error: countError } = await ctx.supabaseAdmin
      .from("personal_coins")
      .select("id", { count: "exact", head: true })
      .eq("image_path", coin.image_path);
    if (countError) return Response.json({ error: countError.message }, { status: 500 });

    if (count === 0) {
      const paths = [coin.image_path, coin.image_path_back].filter(Boolean) as string[];
      await ctx.supabaseAdmin.storage.from("coin-photos").remove(paths);
    }

    return Response.json({ ok: true });
  }),
};
