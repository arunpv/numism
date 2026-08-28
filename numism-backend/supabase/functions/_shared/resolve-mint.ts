// Shared mint lookup (see coin_app_requirements.md §3.7). Case-insensitive/
// trimmed match since AI-extracted wording and manually entered `mints` rows
// can differ in case even when the underlying value is the same.
// deno-lint-ignore no-explicit-any
export async function resolveMintId(supabaseAdmin: any, country: string, mintMark: string | null) {
  if (!mintMark) return null;

  const { data, error } = await supabaseAdmin
    .from("mints")
    .select("id")
    .ilike("country", country.trim())
    .ilike("mint_mark", mintMark.trim())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}
