// See coin_app_requirements.md §3.6, §6 — edits identity fields, notes, and
// album placement on an existing row. Does not touch photos/quantity; those
// are only ever changed via save-duplicate's replace-photo path.
//
// Album placement is validated against the album's layout (num_pages/
// pockets_per_page, uniform across the album) and against other coins
// already placed in the same pocket — enforced, not just a hint, per the
// user's call: a full/out-of-range pocket rejects the save outright.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { resolveMintId } from "../_shared/resolve-mint.ts";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const body = await req.json();
    const { id, country, denomination, mint_year, mint_mark, commemorative_theme, personal_notes, album_id, page_number, pocket_number } = body;

    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    if (!country?.trim() || !denomination?.trim()) {
      return Response.json({ error: "country and denomination are required" }, { status: 400 });
    }

    let mint_id: number | null;
    try {
      mint_id = await resolveMintId(ctx.supabaseAdmin, country, mint_mark ?? null);
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }

    if (album_id != null) {
      const { data: album, error: albumError } = await ctx.supabaseAdmin
        .from("albums")
        .select("num_pages, pockets_per_page")
        .eq("id", album_id)
        .single();
      if (albumError) return Response.json({ error: albumError.message }, { status: 400 });

      if (album.num_pages != null && page_number != null && (page_number < 1 || page_number > album.num_pages)) {
        return Response.json({ error: `Page ${page_number} is out of range (album has ${album.num_pages} pages)` }, {
          status: 400,
        });
      }
      if (
        album.pockets_per_page != null &&
        pocket_number != null &&
        (pocket_number < 1 || pocket_number > album.pockets_per_page)
      ) {
        return Response.json(
          { error: `Pocket ${pocket_number} is out of range (page has ${album.pockets_per_page} pockets)` },
          { status: 400 },
        );
      }

      if (page_number != null && pocket_number != null) {
        const { data: occupant, error: occupantError } = await ctx.supabaseAdmin
          .from("personal_coins")
          .select("id, country, denomination")
          .eq("album_id", album_id)
          .eq("page_number", page_number)
          .eq("pocket_number", pocket_number)
          .neq("id", id)
          .maybeSingle();
        if (occupantError) return Response.json({ error: occupantError.message }, { status: 500 });
        if (occupant) {
          return Response.json(
            {
              error: `Page ${page_number}, pocket ${pocket_number} is already occupied by coin #${occupant.id} (${occupant.country} ${occupant.denomination})`,
            },
            { status: 409 },
          );
        }
      }
    }

    const { data, error } = await ctx.supabaseAdmin
      .from("personal_coins")
      .update({
        country: country.trim(),
        denomination: denomination.trim(),
        mint_year: mint_year ?? null,
        mint_mark: mint_mark || null,
        mint_id,
        commemorative_theme: commemorative_theme || null,
        personal_notes: personal_notes || null,
        album_id: album_id ?? null,
        page_number: page_number ?? null,
        pocket_number: pocket_number ?? null,
      })
      .eq("id", id)
      .select("*, mints(mint_name), albums(name)")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ data });
  }),
};
