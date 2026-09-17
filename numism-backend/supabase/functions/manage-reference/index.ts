// CRUD for the user-maintained reference tables `mints` and `albums`
// (coin_app_requirements.md §3.6, §3.7). RLS on both tables has no
// policies, so the anon/publishable key has zero access — all list/create/
// delete goes through this Edge Function with the service-role key.
//
// "mints" here means the (country, mint_mark) -> mint identity *rule* list,
// backed by `mint_mark_rules` joined to `mints` — a mint mark can resolve to
// more than one mint depending on the coin's year or the mark's position, so
// each "mint" row the client sees is really one rule, flattened for display.
//
// Request body: { table: "mints" | "albums", action: "list" | "create" | "delete", ...fields }
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const TABLES = new Set(["mints", "albums"]);

const MINT_RULE_SELECT =
  "id, country, mint_mark, condition_type, year_min, year_max, position, mint_id, mints(mint_name, mark_image_path)";

// deno-lint-ignore no-explicit-any
function flattenMintRule(row: any) {
  return {
    id: row.id,
    country: row.country,
    mint_mark: row.mint_mark,
    condition_type: row.condition_type,
    year_min: row.year_min,
    year_max: row.year_max,
    position: row.position,
    mint_id: row.mint_id,
    mint_name: row.mints?.mint_name ?? null,
    mark_image_path: row.mints?.mark_image_path ?? null,
  };
}

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const body = await req.json();
    const { table, action } = body;

    if (!TABLES.has(table)) {
      return Response.json({ error: `unknown table: ${table}` }, { status: 400 });
    }

    if (action === "list") {
      if (table === "mints") {
        const { data, error } = await ctx.supabaseAdmin
          .from("mint_mark_rules")
          .select(MINT_RULE_SELECT)
          .order("country")
          .order("mint_mark");
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const flattened = (data ?? []).map(flattenMintRule);
        const withImages = await Promise.all(
          flattened.map(async (m) => ({
            ...m,
            mark_image_url: m.mark_image_path
              ? (await ctx.supabaseAdmin.storage.from("mint-marks").createSignedUrl(m.mark_image_path, 3600)).data
                  ?.signedUrl ?? null
              : null,
          })),
        );
        return Response.json({ data: withImages });
      }

      const { data, error } = await ctx.supabaseAdmin.from(table).select("*").order("name");
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ data });
    }

    if (action === "create") {
      if (table === "mints") {
        const { country, mint_mark, mint_name, condition_type, year_min, year_max, position } = body;
        const conditionType = condition_type || "default";
        if (!country?.trim() || !mint_mark?.trim() || !mint_name?.trim()) {
          return Response.json({ error: "country, mint_mark, and mint_name are required" }, { status: 400 });
        }
        if (conditionType === "year_range" && (year_min == null || year_max == null)) {
          return Response.json({ error: "year_min and year_max are required for a year_range rule" }, { status: 400 });
        }
        if (conditionType === "position" && !position) {
          return Response.json({ error: "position is required for a position rule" }, { status: 400 });
        }

        // Reuse an existing mint identity (same country + name) if this is a
        // second rule for a mint already on file, otherwise create it.
        const { data: existingMint, error: existingMintError } = await ctx.supabaseAdmin
          .from("mints")
          .select("id")
          .ilike("country", country.trim())
          .ilike("mint_name", mint_name.trim())
          .maybeSingle();
        if (existingMintError) return Response.json({ error: existingMintError.message }, { status: 500 });

        let mintId = existingMint?.id;
        if (!mintId) {
          const { data: newMint, error: newMintError } = await ctx.supabaseAdmin
            .from("mints")
            .insert({ country: country.trim(), mint_name: mint_name.trim() })
            .select("id")
            .single();
          if (newMintError) return Response.json({ error: newMintError.message }, { status: 500 });
          mintId = newMint.id;
        }

        const { data, error } = await ctx.supabaseAdmin
          .from("mint_mark_rules")
          .insert({
            country: country.trim(),
            mint_mark: mint_mark.trim(),
            condition_type: conditionType,
            year_min: conditionType === "year_range" ? year_min : null,
            year_max: conditionType === "year_range" ? year_max : null,
            position: conditionType === "position" ? position : null,
            mint_id: mintId,
          })
          .select(MINT_RULE_SELECT)
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ data: flattenMintRule(data) });
      } else {
        const { name, num_pages, pockets_per_page } = body;
        if (!name?.trim()) return Response.json({ error: "name is required" }, { status: 400 });
        const { data, error } = await ctx.supabaseAdmin
          .from("albums")
          .insert({ name: name.trim(), num_pages: num_pages ?? null, pockets_per_page: pockets_per_page ?? null })
          .select()
          .single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ data });
      }
    }

    if (action === "update" && table === "albums") {
      const { id, num_pages, pockets_per_page } = body;
      if (id == null) return Response.json({ error: "id is required" }, { status: 400 });
      const { data, error } = await ctx.supabaseAdmin
        .from("albums")
        .update({ num_pages: num_pages ?? null, pockets_per_page: pockets_per_page ?? null })
        .eq("id", id)
        .select()
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ data });
    }

    if (action === "delete") {
      const { id } = body;
      if (id == null) return Response.json({ error: "id is required" }, { status: 400 });

      if (table === "mints") {
        // `id` here is a mint_mark_rules row. Delete the rule, then — if no
        // other rule still references that mint identity — clean up the now-
        // orphaned `mints` row and its reference photo too. Best-effort: if a
        // personal_coins row already references that mint, the FK stops the
        // delete and the identity is just left in place.
        const { data: rule, error: ruleError } = await ctx.supabaseAdmin
          .from("mint_mark_rules")
          .select("mint_id")
          .eq("id", id)
          .single();
        if (ruleError) return Response.json({ error: ruleError.message }, { status: 500 });

        const { error: deleteRuleError } = await ctx.supabaseAdmin.from("mint_mark_rules").delete().eq("id", id);
        if (deleteRuleError) return Response.json({ error: deleteRuleError.message }, { status: 500 });

        const { count } = await ctx.supabaseAdmin
          .from("mint_mark_rules")
          .select("id", { count: "exact", head: true })
          .eq("mint_id", rule.mint_id);
        if (!count) {
          const { data: mint } = await ctx.supabaseAdmin
            .from("mints")
            .select("mark_image_path")
            .eq("id", rule.mint_id)
            .single();
          if (mint?.mark_image_path) {
            await ctx.supabaseAdmin.storage.from("mint-marks").remove([mint.mark_image_path]);
          }
          await ctx.supabaseAdmin.from("mints").delete().eq("id", rule.mint_id);
        }
        return Response.json({ ok: true });
      }

      const { error } = await ctx.supabaseAdmin.from(table).delete().eq("id", id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
  }),
};
