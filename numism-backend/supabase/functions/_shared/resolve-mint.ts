// Shared mint lookup (see coin_app_requirements.md §3.7). A (country, mark)
// pair can resolve to more than one mint — disambiguated by the mint_year
// (a range, e.g. US "D" = Denver, except 1838-1861 = Dahlonega) or by the
// mark's position relative to a digit of the year (e.g. India "★" = Hyderabad
// plain, but below the first/last digit = Taegu/Seoul). Case-insensitive/
// trimmed match since AI-extracted wording and manually entered rows can
// differ in case even when the underlying value is the same. A blank mark
// resolves against the literal sentinel "No Mark", matching how the
// reference data represents "no mark visible on this coin".
export type ResolvedMint = { id: number; mint_name: string; mark_image_path: string | null };

type MintMarkRuleRow = {
  condition_type: "default" | "year_range" | "position";
  year_min: number | null;
  year_max: number | null;
  position: "first_digit" | "last_digit" | null;
  mints: { id: number; mint_name: string; mark_image_path: string | null } | null;
};

export async function resolveMint(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  country: string,
  mintMark: string | null,
  mintYear: number | null,
  markPosition: string | null,
): Promise<ResolvedMint | null> {
  const mark = mintMark?.trim() || "No Mark";

  const { data, error } = await supabaseAdmin
    .from("mint_mark_rules")
    .select("condition_type, year_min, year_max, position, mints(id, mint_name, mark_image_path)")
    .ilike("country", country.trim())
    .ilike("mint_mark", mark);
  if (error) throw new Error(error.message);

  const rules = (data ?? []) as MintMarkRuleRow[];
  if (rules.length === 0) return null;

  if (markPosition) {
    const match = rules.find((r) => r.condition_type === "position" && r.position === markPosition);
    if (match?.mints) return match.mints;
  }

  if (mintYear != null) {
    const match = rules.find(
      (r) =>
        r.condition_type === "year_range" &&
        r.year_min != null &&
        r.year_max != null &&
        mintYear >= r.year_min &&
        mintYear <= r.year_max,
    );
    if (match?.mints) return match.mints;
  }

  const fallback = rules.find((r) => r.condition_type === "default");
  return fallback?.mints ?? null;
}
