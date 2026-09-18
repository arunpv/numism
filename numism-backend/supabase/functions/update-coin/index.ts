// See coin_app_requirements.md §3.6, §6 — edits identity fields, notes, and
// album placement on an existing row. Does not touch photos; those are only
// ever changed via save-duplicate's replace-photo path (which also repoints
// every other row sharing the same photo, per §3.5).
//
// Album placement is validated against the album's layout (num_pages/
// pockets_per_page, uniform across the album) and against other coins
// already placed in the same pocket — enforced, not just a hint, per the
// user's call: a full/out-of-range pocket rejects the save outright.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { resolveMint } from "../_shared/resolve-mint.ts";
import { callGeminiAssessment, type CoinImage } from "../_shared/coin-schema.ts";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const body = await req.json();
    const {
      id,
      country,
      denomination,
      mint_year,
      mint_mark,
      mint_mark_position,
      commemorative_theme,
      personal_notes,
      album_id,
      page_number,
      pocket_number,
      period,
      value,
      currency,
      composition,
      weight_grams,
      diameter_mm,
      thickness_mm,
      shape,
      orientation,
      demonetized,
      rarity,
      estimated_value_low,
      estimated_value_high,
      grade,
    } = body;

    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    if (!country?.trim() || !denomination?.trim()) {
      return Response.json({ error: "country and denomination are required" }, { status: 400 });
    }

    let mint_id: number | null;
    try {
      const resolved = await resolveMint(
        ctx.supabaseAdmin,
        country,
        mint_mark ?? null,
        mint_year ?? null,
        mint_mark_position ?? null,
      );
      mint_id = resolved?.id ?? null;
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }

    // §identity-change re-estimate: if country/denomination/mint_year/mint_mark/
    // commemorative_theme differ from what's on file, refresh the AI-estimated
    // fields against the coin's existing stored photos rather than trusting
    // stale values from before the edit.
    const { data: existingCoin, error: existingError } = await ctx.supabaseAdmin
      .from("personal_coins")
      .select("country, denomination, mint_year, mint_mark, commemorative_theme, image_path, image_path_back")
      .eq("id", id)
      .single();
    if (existingError) return Response.json({ error: existingError.message }, { status: 404 });

    const identityChanged =
      existingCoin.country !== country.trim() ||
      existingCoin.denomination !== denomination.trim() ||
      (existingCoin.mint_year ?? null) !== (mint_year ?? null) ||
      (existingCoin.mint_mark ?? null) !== (mint_mark || null) ||
      (existingCoin.commemorative_theme ?? null) !== (commemorative_theme || null);

    let assessment: Record<string, unknown> = {
      period,
      value,
      currency,
      composition,
      weight_grams,
      diameter_mm,
      thickness_mm,
      shape,
      orientation,
      demonetized,
      rarity,
      estimated_value_low,
      estimated_value_high,
      grade,
    };

    if (identityChanged && existingCoin.image_path && existingCoin.image_path_back) {
      const apiKey = Deno.env.get("GEMINI_API_KEY");
      if (apiKey) {
        try {
          const [frontDownload, backDownload] = await Promise.all([
            ctx.supabaseAdmin.storage.from("coin-photos").download(existingCoin.image_path),
            ctx.supabaseAdmin.storage.from("coin-photos").download(existingCoin.image_path_back),
          ]);
          if (frontDownload.data && backDownload.data) {
            const front: CoinImage = {
              bytes: await frontDownload.data.arrayBuffer(),
              mimeType: frontDownload.data.type || "image/jpeg",
            };
            const back: CoinImage = {
              bytes: await backDownload.data.arrayBuffer(),
              mimeType: backDownload.data.type || "image/jpeg",
            };
            const refreshed = await callGeminiAssessment(apiKey, front, back, country.trim(), denomination.trim());
            assessment = refreshed;
          }
        } catch {
          // best-effort refresh; fall back to the submitted values if Gemini fails
        }
      }
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
        mint_mark_position: mint_mark_position || null,
        mint_id,
        commemorative_theme: commemorative_theme || null,
        personal_notes: personal_notes || null,
        album_id: album_id ?? null,
        page_number: page_number ?? null,
        pocket_number: pocket_number ?? null,
        ...assessment,
      })
      .eq("id", id)
      .select("*, mints(mint_name), albums(name)")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ data });
  }),
};
