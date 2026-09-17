// See coin_app_requirements.md §3.7. Client-side preview lookup during the
// review step — shows the resolved mint name before the user saves. The
// authoritative resolution still happens again server-side in save-coin.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { resolveMint } from "../_shared/resolve-mint.ts";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const { country, mint_mark, mint_year, mint_mark_position } = await req.json();

    try {
      const resolved = await resolveMint(ctx.supabaseAdmin, country, mint_mark, mint_year ?? null, mint_mark_position ?? null);
      const mark_image_url = resolved?.mark_image_path
        ? (await ctx.supabaseAdmin.storage.from("mint-marks").createSignedUrl(resolved.mark_image_path, 3600)).data
            ?.signedUrl ?? null
        : null;

      return Response.json({ mint_id: resolved?.id ?? null, mint_name: resolved?.mint_name ?? null, mark_image_url });
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }
  }),
};
