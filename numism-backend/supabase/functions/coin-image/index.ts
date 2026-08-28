// See coin_app_requirements.md §5.1 step 5. Resolves a coin's stored image
// to a short-lived signed URL — the bucket is private, no direct client access.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const id = new URL(req.url).pathname.split("/").pop();
    if (!id) return Response.json({ error: "coin id is required" }, { status: 400 });

    const { data: coin, error } = await ctx.supabaseAdmin
      .from("personal_coins")
      .select("image_path")
      .eq("id", id)
      .single();
    if (error) return Response.json({ error: error.message }, { status: 404 });

    const { data, error: signError } = await ctx.supabaseAdmin.storage
      .from("coin-photos")
      .createSignedUrl(coin.image_path, 3600);
    if (signError) return Response.json({ error: signError.message }, { status: 500 });

    return Response.json({ signedUrl: data.signedUrl });
  }),
};
