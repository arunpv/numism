// See coin_app_requirements.md §5.4. Only path that writes a *new* coin
// identity row + its image. Duplicates go through save-duplicate instead.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { resolveMintId } from "../_shared/resolve-mint.ts";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const form = await req.formData();
    const country = form.get("country") as string;
    const denomination = form.get("denomination") as string;
    const mint_year = form.get("mint_year") ? Number(form.get("mint_year")) : null;
    const mint_mark = (form.get("mint_mark") as string) || null;
    const commemorative_theme = (form.get("commemorative_theme") as string) || null;
    const personal_notes = (form.get("personal_notes") as string) || null;
    const image_quality_score = form.get("image_quality_score") ? Number(form.get("image_quality_score")) : null;
    const frontImage = form.get("image") as File;
    const backImage = form.get("image_back") as File;

    if (!frontImage || !backImage) {
      return Response.json({ error: "image and image_back are both required" }, { status: 400 });
    }

    let mint_id: number | null;
    try {
      mint_id = await resolveMintId(ctx.supabaseAdmin, country, mint_mark);
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }

    const imagePath = `coin_${Date.now()}_${crypto.randomUUID()}.jpg`;
    const imagePathBack = `coin_${Date.now()}_${crypto.randomUUID()}_back.jpg`;
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
          mint_id,
          commemorative_theme,
          personal_notes,
          image_path: imagePath,
          image_path_back: imagePathBack,
          image_quality_score,
        },
      ])
      .select("id")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

    return Response.json({ id: data.id });
  }),
};
