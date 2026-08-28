// See coin_app_requirements.md §3.7. Client-side preview lookup during the
// review step — shows the resolved mint name before the user saves. The
// authoritative resolution still happens again server-side in save-coin.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const { country, mint_mark } = await req.json();

    if (!mint_mark) return Response.json({ mint_name: null });

    const { data, error } = await ctx.supabaseAdmin
      .from("mints")
      .select("id, mint_name")
      .ilike("country", country.trim())
      .ilike("mint_mark", mint_mark.trim())
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ mint_id: data?.id ?? null, mint_name: data?.mint_name ?? null });
  }),
};
