// See coin_app_requirements.md §3.5, §5.5. Confirms a duplicate against an
// existing row: increments quantity, and only touches Storage if the user
// explicitly chose to replace the photo (replaceImage=true). Never sets
// album_id/page_number/pocket_number — duplicates are never placed (§3.6).
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

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

    const { data: existing, error: fetchError } = await ctx.supabaseAdmin
      .from("personal_coins")
      .select("id, image_path, image_path_back, quantity, personal_notes")
      .eq("id", matchedId)
      .single();
    if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

    const updates: Record<string, unknown> = {
      quantity: existing.quantity + 1,
      personal_notes: personal_notes
        ? [existing.personal_notes, personal_notes].filter(Boolean).join("\n")
        : existing.personal_notes,
    };

    if (replaceImage && image && imageBack) {
      const newImagePath = `coin_${Date.now()}_${crypto.randomUUID()}.jpg`;
      const newImagePathBack = `coin_${Date.now()}_${crypto.randomUUID()}_back.jpg`;
      const { error: uploadError } = await ctx.supabaseAdmin.storage
        .from("coin-photos")
        .upload(newImagePath, image, { contentType: image.type || "image/jpeg" });
      if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

      const { error: uploadBackError } = await ctx.supabaseAdmin.storage
        .from("coin-photos")
        .upload(newImagePathBack, imageBack, { contentType: imageBack.type || "image/jpeg" });
      if (uploadBackError) return Response.json({ error: uploadBackError.message }, { status: 500 });

      const oldPaths = [existing.image_path, existing.image_path_back].filter(Boolean) as string[];
      await ctx.supabaseAdmin.storage.from("coin-photos").remove(oldPaths);
      updates.image_path = newImagePath;
      updates.image_path_back = newImagePathBack;
      updates.image_quality_score = new_quality_score;
    }

    const { error: updateError } = await ctx.supabaseAdmin
      .from("personal_coins")
      .update(updates)
      .eq("id", matchedId);
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    return Response.json({ id: matchedId, quantity: updates.quantity });
  }),
};
