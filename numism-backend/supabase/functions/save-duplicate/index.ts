// See coin_app_requirements.md §3.5, §5.5. Confirms a duplicate by inserting
// its own new row — a duplicate is a real owned specimen, not just a count —
// sharing the matched row's photo (same image_path/image_path_back) rather
// than uploading a fresh one, unless the user explicitly chose to replace
// it. A replacement becomes the shared photo for every row of this
// identity, not just the two involved here, since they're all pictures of
// physically-identical specimens.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const COPIED_IDENTITY_FIELDS =
  "country, denomination, mint_year, mint_mark, mint_mark_position, mint_id, commemorative_theme, " +
  "image_path, image_path_back, image_quality_score, period, value, currency, composition, weight_grams, " +
  "diameter_mm, thickness_mm, shape, orientation, demonetized, rarity, estimated_value_low, " +
  "estimated_value_high, grade";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const form = await req.formData();
    const matchedId = Number(form.get("matchedId"));
    const replaceImage = form.get("replaceImage") === "true";
    const personal_notes = (form.get("personal_notes") as string) || null;
    const image = form.get("image") as File | null;
    const imageBack = form.get("image_back") as File | null;
    const new_quality_score = form.get("new_quality_score") ? Number(form.get("new_quality_score")) : null;

    if (!matchedId) return Response.json({ error: "matchedId is required" }, { status: 400 });
    if (replaceImage && (!image || !imageBack)) {
      return Response.json({ error: "image and image_back are required when replaceImage=true" }, { status: 400 });
    }

    const { data: matched, error: fetchError } = await ctx.supabaseAdmin
      .from("personal_coins")
      .select(COPIED_IDENTITY_FIELDS)
      .eq("id", matchedId)
      .single();
    if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

    let image_path = matched.image_path;
    let image_path_back = matched.image_path_back;
    let image_quality_score = matched.image_quality_score;

    if (replaceImage && image && imageBack) {
      const frontExt = (image.type || "image/jpeg").includes("png") ? "png" : "jpg";
      const backExt = (imageBack.type || "image/jpeg").includes("png") ? "png" : "jpg";
      const newImagePath = `coin_${Date.now()}_${crypto.randomUUID()}.${frontExt}`;
      const newImagePathBack = `coin_${Date.now()}_${crypto.randomUUID()}_back.${backExt}`;
      const { error: uploadError } = await ctx.supabaseAdmin.storage
        .from("coin-photos")
        .upload(newImagePath, image, { contentType: image.type || "image/jpeg" });
      if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

      const { error: uploadBackError } = await ctx.supabaseAdmin.storage
        .from("coin-photos")
        .upload(newImagePathBack, imageBack, { contentType: imageBack.type || "image/jpeg" });
      if (uploadBackError) return Response.json({ error: uploadBackError.message }, { status: 500 });

      // Repoint every other row sharing the old photo to the new one — it's
      // a better picture of the same physical mintage, not just this pair's.
      const oldImagePath = matched.image_path;
      const oldImagePathBack = matched.image_path_back;
      const { error: repointError } = await ctx.supabaseAdmin
        .from("personal_coins")
        .update({ image_path: newImagePath, image_path_back: newImagePathBack, image_quality_score: new_quality_score })
        .eq("image_path", oldImagePath);
      if (repointError) return Response.json({ error: repointError.message }, { status: 500 });

      const oldPaths = [oldImagePath, oldImagePathBack].filter(Boolean) as string[];
      await ctx.supabaseAdmin.storage.from("coin-photos").remove(oldPaths);

      image_path = newImagePath;
      image_path_back = newImagePathBack;
      image_quality_score = new_quality_score;
    }

    const { data, error: insertError } = await ctx.supabaseAdmin
      .from("personal_coins")
      .insert([
        {
          country: matched.country,
          denomination: matched.denomination,
          mint_year: matched.mint_year,
          mint_mark: matched.mint_mark,
          mint_mark_position: matched.mint_mark_position,
          mint_id: matched.mint_id,
          commemorative_theme: matched.commemorative_theme,
          image_path,
          image_path_back,
          image_quality_score,
          personal_notes,
          period: matched.period,
          value: matched.value,
          currency: matched.currency,
          composition: matched.composition,
          weight_grams: matched.weight_grams,
          diameter_mm: matched.diameter_mm,
          thickness_mm: matched.thickness_mm,
          shape: matched.shape,
          orientation: matched.orientation,
          demonetized: matched.demonetized,
          rarity: matched.rarity,
          estimated_value_low: matched.estimated_value_low,
          estimated_value_high: matched.estimated_value_high,
          grade: matched.grade,
        },
      ])
      .select("id")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

    return Response.json({ id: data.id });
  }),
};
