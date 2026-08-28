// CRUD for the user-maintained reference tables `mints` and `albums`
// (coin_app_requirements.md §3.6, §3.7). RLS on both tables has no
// policies, so the anon/publishable key has zero access — all list/create/
// delete goes through this Edge Function with the service-role key.
//
// Request body: { table: "mints" | "albums", action: "list" | "create" | "delete", ...fields }
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const TABLES = new Set(["mints", "albums"]);

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const body = await req.json();
    const { table, action } = body;

    if (!TABLES.has(table)) {
      return Response.json({ error: `unknown table: ${table}` }, { status: 400 });
    }

    if (action === "list") {
      const orderCol = table === "mints" ? "country" : "name";
      const { data, error } = await ctx.supabaseAdmin.from(table).select("*").order(orderCol);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      if (table === "mints") {
        const withImages = await Promise.all(
          (data ?? []).map(async (m) => ({
            ...m,
            mark_image_url: m.mark_image_path
              ? (await ctx.supabaseAdmin.storage.from("mint-marks").createSignedUrl(m.mark_image_path, 3600)).data
                  ?.signedUrl ?? null
              : null,
          })),
        );
        return Response.json({ data: withImages });
      }
      return Response.json({ data });
    }

    if (action === "create") {
      if (table === "mints") {
        const { country, mint_mark, mint_name } = body;
        if (!country?.trim() || !mint_mark?.trim() || !mint_name?.trim()) {
          return Response.json({ error: "country, mint_mark, and mint_name are required" }, { status: 400 });
        }
        const { data, error } = await ctx.supabaseAdmin
          .from("mints")
          .insert({ country: country.trim(), mint_mark: mint_mark.trim(), mint_name: mint_name.trim() })
          .select()
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ data });
      } else {
        const { name } = body;
        if (!name?.trim()) return Response.json({ error: "name is required" }, { status: 400 });
        const { data, error } = await ctx.supabaseAdmin.from("albums").insert({ name: name.trim() }).select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ data });
      }
    }

    if (action === "delete") {
      const { id } = body;
      if (id == null) return Response.json({ error: "id is required" }, { status: 400 });

      if (table === "mints") {
        const { data: mint } = await ctx.supabaseAdmin.from("mints").select("mark_image_path").eq("id", id).single();
        if (mint?.mark_image_path) {
          await ctx.supabaseAdmin.storage.from("mint-marks").remove([mint.mark_image_path]);
        }
      }

      const { error } = await ctx.supabaseAdmin.from(table).delete().eq("id", id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
  }),
};
