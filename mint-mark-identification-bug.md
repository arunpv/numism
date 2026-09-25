# Bug: Mint mark not identified despite being clearly visible

## Symptom

Reported against the most recently saved coins: the Gemini extraction call
completes successfully (no error, no 429/503 — see the separate
capture-reliability fix already committed on this branch), but the coin's
`mint_mark` field comes back empty even when the mark is clean and legible
in the photos. Example given: a US coin with a clean "D" mark — not
identified.

**Not yet confirmed**: this session had no live Supabase credentials
available (no real `.env`, no Supabase CLI installed), so the actual saved
row and the actual `extract-coin` response body for the failing capture
could not be pulled. Everything below is a static-analysis diagnosis of two
distinct, plausible root causes found by reading the code — one of them
needs to be confirmed against the real data before fixing.

## Where the logic lives

`numism-backend/supabase/functions/extract-coin/index.ts` calls Gemini
twice per capture (`numism-backend/supabase/functions/_shared/coin-schema.ts`):

1. **First pass** (`callGemini`) — free-text extraction of every field,
   including a best-effort `mint_mark` guess, alongside country,
   denomination, year, etc.
2. **Second pass** (`callGeminiMintMatch`) — *only if* the coin's country
   has known mint marks already on file — re-examines the image with the
   model constrained to pick from that exact set (or `null`), specifically
   because the free-text first-pass guess isn't trusted for this field (see
   the comment at `extract-coin/index.ts:27-29`):

   ```ts
   // §3.7: if we already have known mint marks on file for this country,
   // re-examine the image constrained to that set instead of trusting
   // the free-text first-pass guess.
   ```

   When the second pass runs, its result **overwrites** the first pass's
   guess unconditionally (`extract-coin/index.ts:40`):

   ```ts
   fields.mint_mark = matched.mint_mark;
   ```

So there are two independent ways this can end up empty: the second pass
either (A) never runs when it should, leaving a possibly-unreliable
free-text guess in place, or (B) runs but answers wrong, clobbering a
correct free-text guess with `null`.

## Hypothesis A — the constrained second pass never triggers

`extract-coin/index.ts:30-33`:

```ts
const { data: knownRuleRows, error: mintsError } = await ctx.supabaseAdmin
  .from("mint_mark_rules")
  .select("mint_mark")
  .ilike("country", fields.country.trim());
```

`.ilike()` with no `%` wildcards is an **exact** (case-insensitive) string
match. The seed data (`numism-backend/supabase/migrations/20260917160000_mint_mark_rules.sql`)
stores the country as the literal string `"United States of America"`. If
Gemini's free-text `country` field for a given US coin comes back as
anything else — `"USA"`, `"United States"`, `"US"`, `"U.S.A."` — this query
returns **zero rows**, `knownMarks.length` is `0`, the constrained pass at
`extract-coin/index.ts:38-42` is skipped entirely, and the app silently
keeps the free-text first-pass guess — the exact guess the code comment
above says not to trust for this field.

`numism-backend/supabase/functions/_shared/resolve-mint.ts:33-34` has the
identical exact-match pattern for the *separate* mint-resolution query
(country + mark → mint_id/mint_name), so if this is the root cause it likely
affects that lookup too, not just the mark-extraction step.

**Likely fix direction:** don't require Gemini's free-text country string to
exactly match the DB spelling. Options: normalize both sides before
comparing (trim/lowercase/strip punctuation), maintain a country
alias/synonym table, or have the *first* Gemini pass return a country
constrained to an enum of countries already on file (mirroring how the mark
constraint already works), so the two passes can never disagree on country
spelling in the first place.

## Hypothesis B — the constrained second pass runs but wrongly answers null

`numism-backend/supabase/functions/_shared/coin-schema.ts:245-250` (the
schema passed to the second pass):

```ts
mint_mark: {
  type: "string",
  nullable: true,
  enum: [...knownMarks, null],
  description: "Must be exactly one of the known marks, or null if none match / not legible.",
},
```

Mixing a literal `null` into a `type: "string"` enum array is not valid
JSON Schema (`null` is not a `string`) — `nullable: true` is already the
correct way to say the field may be absent under Gemini's
OpenAPI-3.0-derived schema dialect. Adding `null` again inside `enum` is at
best redundant and at worst causes Gemini's structured-output validator to
treat the field inconsistently, which could bias the model toward emitting
`null` under any uncertainty rather than confidently picking a known mark —
even when the mark is clearly legible, if the model's uncertainty is
elsewhere (image framing, an unfamiliar font for the letter, etc.). The same
pattern also appears in the `mint_mark_position` field two lines below it
(`coin-schema.ts:256`, `enum: ["first_digit", "last_digit", null]`).

**Likely fix direction:** drop the literal `null` from both `enum` arrays
and rely solely on `nullable: true` to allow the null case, per Gemini's own
schema semantics.

## How to tell which one it is (needed before fixing)

Pull the `extract-coin` response body for the failing capture (browser
Network tab, or the Edge Function's logs in the Supabase dashboard) and
check `fields.country` and `fields.mint_mark`/`mint_mark_position`:

- If `mint_mark_position` is `null` **and** was never set (i.e. the response
  shape suggests the constrained pass didn't run at all) → **Hypothesis A**.
  Cross-check by running `select country, mint_mark from mint_mark_rules
  where mint_mark = 'D';` in Supabase and comparing the stored country
  string(s) against the `fields.country` value Gemini actually returned for
  this coin.
- If the response clearly went through the second pass (e.g.
  `mint_mark_position` is present/non-trivial, or the country matched a
  known-marks country) but `mint_mark` is still `null` → **Hypothesis B**.

Both are real, low-risk fixes to make independently of which one turns out
to be the actual cause here — A hardens the country-matching against wording
drift, B removes a malformed piece of the schema — but confirming which one
is actually firing for this specific coin will tell you which fix actually
closes the reported bug (vs. just improving something adjacent).

## Not part of this bug

The separate capture-reliability fix (429/503 retry-with-backoff and
request timeouts across the Gemini call, the frontend API layer, and the
service worker) is unrelated to this issue and was already fixed and
verified on this branch — see the git history for
`numism-backend/supabase/functions/_shared/coin-schema.ts`, `src/lib/api.ts`,
and `src/sw.ts`.
