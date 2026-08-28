// Attaches/replaces/clears the optional reference photo on a `mints` row
// (coin_app_requirements.md §3.7 discussion — some marks aren't reliably
// describable in words). Text mint_mark stays the authoritative match key;
// this is a visual aid only.
//
// multipart/form-data: mintId (required), image (File, omit to clear).
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    const form = await req.formData();
    const mintId = Number(form.get("mintId"));
    const image = form.get("image") as File | null;

    if (!mintId) return Response.json({ error: "mintId is required" }, { status: 400 });

    const { data: mint, error: fetchError } = await ctx.supabaseAdmin
      .from("mints")
      .select("mark_image_path")
      .eq("id", mintId)
      .single();
    if (fetchError) return Response.json({ error: fetchError.message }, { status: 404 });

    if (mint.mark_image_path) {
      await ctx.supabaseAdmin.storage.from("mint-marks").remove([mint.mark_image_path]);
    }

    let newPath: string | null = null;
    if (image) {
      newPath = `mint_${mintId}_${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await ctx.supabaseAdmin.storage
        .from("mint-marks")
        .upload(newPath, image, { contentType: image.type || "image/jpeg" });
      if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });
    }

    const { error: updateError } = await ctx.supabaseAdmin
      .from("mints")
      .update({ mark_image_path: newPath })
      .eq("id", mintId);
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    const mark_image_url = newPath
      ? (await ctx.supabaseAdmin.storage.from("mint-marks").createSignedUrl(newPath, 3600)).data?.signedUrl ?? null
      : null;
    return Response.json({ mark_image_url });
  }),
};
