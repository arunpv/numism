// See coin_app_requirements.md §5.4. Only path that writes a *new* coin
// identity row + its image. Duplicates go through save-duplicate instead.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { resolveMint } from "../_shared/resolve-mint.ts";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const form = await req.formData();
    const country = form.get("country") as string;
    const denomination = form.get("denomination") as string;
    const mint_year = form.get("mint_year") ? Number(form.get("mint_year")) : null;
    const mint_mark = (form.get("mint_mark") as string) || null;
    const mint_mark_position = (form.get("mint_mark_position") as string) || null;
    const commemorative_theme = (form.get("commemorative_theme") as string) || null;
    const personal_notes = (form.get("personal_notes") as string) || null;
    const image_quality_score = form.get("image_quality_score") ? Number(form.get("image_quality_score")) : null;
    const frontImage = form.get("image") as File;
    const backImage = form.get("image_back") as File;

    const period = (form.get("period") as string) || null;
    const value = form.get("value") ? Number(form.get("value")) : null;
    const currency = (form.get("currency") as string) || null;
    const composition = (form.get("composition") as string) || null;
    const weight_grams = form.get("weight_grams") ? Number(form.get("weight_grams")) : null;
    const diameter_mm = form.get("diameter_mm") ? Number(form.get("diameter_mm")) : null;
    const thickness_mm = form.get("thickness_mm") ? Number(form.get("thickness_mm")) : null;
    const shape = (form.get("shape") as string) || null;
    const orientation = (form.get("orientation") as string) || null;
    const demonetized = form.get("demonetized") === "true";
    const rarity = (form.get("rarity") as string) || null;
    const estimated_value_low = form.get("estimated_value_low") ? Number(form.get("estimated_value_low")) : null;
    const estimated_value_high = form.get("estimated_value_high") ? Number(form.get("estimated_value_high")) : null;
    const grade = (form.get("grade") as string) || null;

    if (!frontImage || !backImage) {
      return Response.json({ error: "image and image_back are both required" }, { status: 400 });
    }

    let mint_id: number | null;
    try {
      const resolved = await resolveMint(ctx.supabaseAdmin, country, mint_mark, mint_year, mint_mark_position);
      mint_id = resolved?.id ?? null;
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }

    const frontExt = (frontImage.type || "image/jpeg").includes("png") ? "png" : "jpg";
    const backExt = (backImage.type || "image/jpeg").includes("png") ? "png" : "jpg";
    const imagePath = `coin_${Date.now()}_${crypto.randomUUID()}.${frontExt}`;
    const imagePathBack = `coin_${Date.now()}_${crypto.randomUUID()}_back.${backExt}`;
    const { error: uploadError } = await ctx.supabaseAdmin.storage
      .from("coin-photos")
      .upload(imagePath, frontImage, { contentType: frontImage.type || "image/jpeg" });
    if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

    const { error: uploadBackError } = await ctx.supabaseAdmin.storage
      .from("coin-photos")
      .upload(imagePathBack, backImage, { contentType: backImage.type || "image/jpeg" });
    if (uploadBackError) return Response.json({ error: uploadBackError.message }, { status: 500 });

    const { data, error: insertError } = await ctx.supabaseAdmin
      .from("personal_coins")
      .insert([
        {
          country,
          denomination,
          mint_year,
          mint_mark,
          mint_mark_position,
          mint_id,
          commemorative_theme,
          personal_notes,
          image_path: imagePath,
          image_path_back: imagePathBack,
          image_quality_score,
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
        },
      ])
      .select("id")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

    return Response.json({ id: data.id });
  }),
};
