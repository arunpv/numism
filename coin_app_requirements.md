# Product Requirements Document (PRD)
## Project: Personal Coin Scanner (Web + PWA, Supabase Integration)

### 1. Objective
A personal-use web application (installable as a PWA on mobile) to capture images of coins, automatically extract numismatic details using Gemini 3.6 Flash, and store the structured data along with the image files in Supabase — after the user reviews and confirms the extracted fields.

### 2. High-Level Architecture
*   **Single-user, unauthenticated.** Not published to any app store; hosted as a sub-site under orchestrun storage. No login screen; access control is "don't share the URL" plus Supabase keeping write access behind the backend (see below).
*   **Frontend:** Standalone repo — `/home/arun/projects/Numismatica` (project name **Numismatica**), a Vite + React + TypeScript PWA, fully decoupled from Orchestrun. (Earlier drafts of this PRD proposed hosting under `www.orchestrun.com/numism` inside the Orchestrun-Web repo; the user opted to keep it fully separate instead — different codebase, different deploy target, not served from orchestrun.com at all.) Deployed to a free static host (Vercel). Installable as a PWA; uses the browser `MediaDevices`/`<input capture>` camera APIs — works on both desktop and mobile browsers, no native app/App Store distribution needed since this is personal-use only.
*   **Backend proxy:** A Supabase Edge Function (Deno) is the only thing holding the Gemini API key and the Supabase service-role key (if used for storage writes). The client never sees either secret. Flow: client uploads image bytes to the Edge Function → function calls Gemini 3.6 Flash for extraction and returns structured JSON to the client for review → on confirm, client (or the same function) uploads the image to Storage and inserts the DB row.
*   **AI Vision Service:** Gemini 3.6 Flash, called server-side only, with a strict JSON schema (`responseSchema`) so the model is constrained to the target structure below.
*   **Backend & DB Layer:** Supabase — Storage bucket for images, Postgres table for structured records.

---

### 3. Core Functional Requirements

#### 3.1 Camera & Image Capture
*   Use the browser camera (`<input type="file" accept="image/*" capture="environment">` on mobile, file picker fallback on desktop) — no native permission plumbing needed beyond the browser's own camera prompt.
*   Tap-to-capture / tap-to-select interface with an image preview before upload.
*   Client-side downscale/compress to a max dimension (e.g. 1600px) and re-encode as JPEG (quality ~0.8) before upload, to keep payloads small over mobile data **and stay within the Supabase free tier's 1GB Storage cap** (see §4.3 for the budget this implies).

#### 3.2 AI Identification Engine
*   Client sends the compressed image (base64 or multipart) to the Supabase Edge Function endpoint — never directly to Gemini.
*   Edge Function calls Gemini 3.6 Flash with `responseMimeType: "application/json"` and a `responseSchema` enforcing the structure below, so malformed output is rejected at the API level rather than parsed hopefully.
*   **Target JSON Response Structure:**
    ```json
    {
      "country": "String",
      "denomination": "String",
      "mint_year": "Integer or null",
      "mint_mark": "String or null"
    }
    ```
*   Edge Function returns this JSON to the client. It is **not** written to the database yet.

#### 3.3 Review & Edit Step
*   Client renders the returned fields in an editable form (text inputs for country/denomination/mint_mark, numeric input for mint_year) alongside the captured image.
*   A free-text `personal_notes` field is available for the user to add their own remarks.
*   As soon as fields are populated (from AI or user edit), the client runs a **duplicate check** (§3.5) and surfaces any matches inline in the review form, before the user commits.
*   User taps "Save" to confirm — only then does the record get persisted. User can also discard and retake the photo.

#### 3.4 Supabase Cloud Pipeline
*   **Storage Bucket Asset Upload:** On save, upload the compressed image into the Supabase Storage bucket `coin-photos` under a unique path (e.g. `coin_${timestamp}_${uuid}.jpg`). Bucket is **private**; access is via signed URLs generated on read, not a public bucket (see §4.2).
*   **Database Record Persistence:** Insert one row into `personal_coins` with the (possibly user-edited) AI fields, the `personal_notes` text, the storage path (not a public URL — resolved to a signed URL at display time), and (once populated) the album placement fields from §3.6.

#### 3.5 Duplicate Detection
*   **Match key:** a coin is considered a likely duplicate when `country`, `denomination`, `mint_year`, and `mint_mark` all match an existing row (nulls match nulls). This is a heuristic, not a hard constraint — a collector can legitimately own two of the same coin (e.g. different condition/grade), so a match is **flagged for a decision, not silently blocked or silently duplicated**.
*   **Where it runs:** a new Edge Function endpoint, `check-duplicate`, queries `personal_coins` for rows matching the candidate fields and returns any matches (id, thumbnail signed URL, `image_quality_score`, existing notes/album placement) to the client.
*   **One stored image per coin identity — user decides which:** duplicates do **not** each get their own stored photo by default. When a match is found, the app shows the new photo side-by-side with the existing stored one, along with an **image quality score** for each (§3.2 — Gemini also returns a 0–100 clarity/quality estimate alongside the extracted fields, shown as a hint, not a verdict — the user has final say, e.g. for old/rare coins where they may want to keep an existing photo for reasons the score can't capture, or vice versa). The user picks one of:
    *   **Keep existing photo** — new photo is discarded, never uploaded to Storage.
    *   **Replace with new photo** — old Storage object is deleted, new one uploaded, `image_quality_score` updated on the existing row.
    *   Nothing is written to Storage until the user makes this choice.
*   **What gets recorded:** rather than inserting a second row, a confirmed duplicate **increments a `quantity` counter** on the existing matching row (§4.1) — it represents "I own N of this coin," not N separate photographed records. `personal_notes` from the duplicate capture (if any) can be appended to the existing row's notes.
*   **User control:** the review form shows the warning banner and match details before committing anything; the user can also back out entirely (e.g. they mis-scanned, or it isn't actually the same coin — AI extraction can be wrong) rather than accepting the duplicate action.
*   **No DB-level uniqueness constraint** is added on the match-key columns — matching is app-logic, not a DB constraint, since it's a heuristic.

#### 3.6 Album Placement (Display Location)
*   Purpose: once a coin is physically placed into a display album, record *where* — which album, page, and pocket — so the app can answer "where is coin X" and, later, "what's in album Y, page Z."
*   This is a **separate step from capture/save** — a coin can exist in the collection (row in `personal_coins`) before it's been placed in an album, so placement fields are nullable and editable after the fact (e.g. from a future edit/detail view).
*   **Duplicates are never placed in an album.** Only the single representative row per coin identity (§3.5) is eligible for album placement — extra owned specimens are tracked purely via `quantity`, since only one physical coin per identity goes on display. Placement fields (`album_id`/`page_number`/`pocket_number`) live on that one row and are untouched by duplicate increments.
*   **Deliberately kept dynamic, not fixed to a page/pocket count.** The user does not have the physical album specs on hand yet (needs to locate them), and different albums may not share the same layout (pockets-per-page can vary by album or even by page — e.g. a page of large coins vs. a page of small ones). So the schema captures placement as **free-form coordinates**, not a rigid grid tied to a predefined layout table:
    *   `album_id` — which album (FK to `albums`).
    *   `page_number` — plain sequential integer, works regardless of how a page is laid out.
    *   `pocket_number` — plain sequential integer *within that page*, counted left-to-right/top-to-bottom as the user defines it. This works for irregular pocket counts/shapes without needing to model the physical grid — it's just "the Nth pocket on this page," not `(row, col)`.
    *   No `pages_count` / `pockets_per_page` capacity fields on `albums` — capacity isn't tracked or validated. The app does not attempt to know if a page/pocket is "full" or enforce a max; it just records where a coin was put, whenever the user says so.
*   This keeps the door open for a real layout model later (e.g. row/column grid, capacity checks, "show me an empty pocket") if/when the user locates the specs and wants that — but nothing here needs to change to support it; a layout table can be added additively without touching the `personal_coins` placement columns.
*   A minimal `albums` table is added now as a placeholder (id + name) so the FK relationship exists; the user will populate real album names/details once located.

---

#### 3.7 Mint Mark Resolution
*   Purpose: attach the actual mint (facility/city) that stamped a coin, not just the raw mark read off it — a mint mark is only meaningful in context of the issuing country (e.g. "D" = Denver for US coins, but means something else, or nothing, elsewhere).
*   **`mint_mark` is not always a letter.** Some countries/mints use shape marks (e.g. a circle, diamond, dot, star) instead of or alongside letters. `mint_mark` stays free-text (§4.1) to accommodate this, but the extraction prompt (§5.2) is worded to describe a shape mark in words (e.g. `"circle"`, `"diamond"`, `"5-pointed star"`) rather than trying to output a glyph, so values are consistent and matchable against the `mints` table — the same normalized wording the user uses when populating `mints` (e.g. always `"circle"`, not sometimes `"○"` or `"round dot"`) is what has to line up on both sides for the lookup in §3.7 to hit.
*   **User-maintained reference table, not AI-guessed.** Each country has a fixed, known set of mints, so the user pre-populates a `mints` table (country, mint_mark, mint_name) themselves — via the Supabase Studio table editor — before scanning a batch of coins from that country. No AI call is involved in resolving a mint name; extraction only returns the raw `mint_mark` (§3.2), unchanged.
*   **Resolution flow:** once `country` + `mint_mark` are known (from AI extraction or user edit) during the review step (§3.3), the client looks up the `mints` table for a matching (country, mint_mark) row — matched case-insensitively/trimmed, since AI wording and manual entry can differ in case ("Circle" vs "circle") even when the underlying value is the same — and shows the resolved mint name inline (read-only display, not another editable AI-guessed field). If no match exists, the review form shows "no mint on file for {country} / {mint_mark}" rather than blocking save — the coin still saves with its raw `mint_mark`; the user can add the missing row to `mints` afterward and it'll resolve for that coin and all future ones automatically.
*   `personal_coins.mint_id` stores the resolved FK (nullable) so historical rows immediately reflect any later addition/correction in `mints` — it's a join, not a copied string, so fixing a mint name in one place fixes it everywhere it's used.
*   Resolution also runs server-side in `save-coin`/`save-duplicate` at write time (not just client-side preview) so the stored `mint_id` is always consistent with the reference table at the moment of saving, and doesn't depend on the client having done the lookup correctly.
*   **Constrained extraction, once marks are on file.** Free-text AI extraction of a mint mark is unreliable (marks are often tiny/worn, and even a correct read may not exactly match the wording stored in `mints`). Once `mints` has one or more rows for the AI-guessed `country`, `extract-coin` (§5.2) makes a **second Gemini call**, re-examining the same image but constrained to only the known marks for that country (`responseSchema` enum) plus `null` — turning "guess what symbol this is" into "pick which of these known marks this matches, or say none." This is skipped (no extra API call) when no marks are on file yet for that country, so it costs nothing until you've started populating `mints`. `extract-coin` now also returns `mint_id`/`mint_name` directly, resolved server-side, so the review step doesn't need a separate round trip for the common case (only calling `resolve-mint` again if the user manually edits `mint_mark`).

### 4. Technical Specifications & Blueprints

#### 4.1 Supabase Database Entity Migration Script
Execute the following schema creation statement inside the target cloud environment:

```sql
-- Placeholder until real album layouts (pages x pockets) are provided.
-- Structure will likely evolve once actual specs are shared.
CREATE TABLE albums (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User-maintained: pre-populate before scanning a batch from a given country.
-- mint_mark is free-text to cover both letters ("D") and shape marks
-- ("circle", "diamond") — see §3.7. Matched case-insensitively/trimmed at
-- lookup time, so this stored form doesn't need to be perfectly normalized.
CREATE TABLE mints (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    country TEXT NOT NULL,
    mint_mark TEXT NOT NULL,
    mint_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (country, mint_mark)
);

CREATE TABLE personal_coins (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    country TEXT NOT NULL,
    denomination TEXT NOT NULL,
    mint_year INT2,
    mint_mark TEXT,
    mint_id BIGINT REFERENCES mints(id),  -- resolved from (country, mint_mark) at save time; null if no match on file yet
    image_path TEXT NOT NULL,   -- Storage object path, not a public URL
    image_quality_score INT2,  -- Gemini-estimated clarity 0-100, shown as a hint during duplicate review
    quantity INT2 NOT NULL DEFAULT 1,  -- how many specimens owned matching this identity
    personal_notes TEXT,
    album_id BIGINT REFERENCES albums(id),   -- nullable: set once physically placed; never set on duplicates beyond the first
    page_number INT2,                        -- nullable, pending album spec
    pocket_number INT2,                      -- nullable, pending album spec
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Speeds up the duplicate-check query in §3.5.
CREATE INDEX idx_personal_coins_dedup ON personal_coins (country, denomination, mint_year, mint_mark);

ALTER TABLE mints ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_coins ENABLE ROW LEVEL SECURITY;
-- No auth.uid() policies needed for a single-user app; all access goes
-- through the Edge Function using the service-role key, which bypasses
-- RLS by design. RLS is enabled anyway so the anon/public key (if ever
-- exposed) grants zero access by default.
```

#### 4.2 Storage Policy Requirement
*   The `coin-photos` bucket is created as **private** (not public).
*   Only the Edge Function (using the Supabase **service-role key**, held server-side only) writes to the bucket and to `personal_coins`. The client-side anon key is never given insert/write policies on either.
*   To display a saved coin's photo, the client requests a **signed URL** (short-lived, e.g. 1 hour) from the Edge Function for that `image_path`, rather than storing/using a permanent public link.

---

#### 4.3 Storage Budget (Free Tier: 500MB DB / 1GB Storage)
*   At the §3.1 target (max 1600px longest edge, JPEG ~q0.8), a typical coin photo runs roughly **150–300KB**. The 1GB Storage cap therefore holds on the order of **3,000–6,000 unique coin identities** — because duplicates reuse/replace the single stored image (§3.5) rather than adding a new file, this budget tracks the size of the *collection*, not the number of times a coin is scanned.
*   `personal_coins` rows are small (a few hundred bytes each, no image bytes in the DB); 500MB of DB storage is not a practical constraint — it would hold low millions of rows.
*   If actual photos run larger than expected (e.g. very detailed macro shots), tighten the max dimension or JPEG quality in §3.1 rather than raising the Storage cap — no architecture change needed either way, since compression is a client-side constant, not a schema/API decision.
*   Should the collection approach the cap, the fix is a plan upgrade on the same Supabase project (bucket/table structure is unaffected) — noting this now so it's a known, cheap escape hatch rather than a surprise.

### 5. Implementation Flow

#### 5.1 Client (browser/PWA)

```javascript
// 1. User captures/selects a photo, client compresses it to JPEG (<= 1600px)
const compressedBlob = await compressImage(capturedFile);

// 2. Send to the Edge Function for AI extraction only — no direct AI or
//    Supabase-write calls from the client.
const { fields } = await fetch('/functions/v1/extract-coin', {
    method: 'POST',
    body: compressedBlob,
}).then(r => r.json());
// fields = { country, denomination, mint_year, mint_mark }

// 3. Render `fields` in an editable review form; user edits/confirms,
//    optionally adds personal_notes.

// 3b. Check for existing matches before allowing save.
const { matches } = await fetch('/functions/v1/check-duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
}).then(r => r.json());
// matches = [{ id, thumbnail_url, image_quality_score, personal_notes, album_id, page_number, pocket_number }, ...]

// 4a. No match -> normal save, first specimen of this identity.
if (matches.length === 0) {
    const { id } = await fetch('/functions/v1/save-coin', {
        method: 'POST',
        body: buildMultipart({ ...editedFields, personal_notes, image: compressedBlob, new_quality_score }),
    }).then(r => r.json());
}

// 4b. Match found -> show new photo + each match's photo/score side-by-side and
//     let the user decide, per match, what to do. The score is a hint only;
//     the user (not the app) makes the call, e.g. to protect a rare/old coin's
//     existing photo even if it scores lower.
//     User choice A: "Not a duplicate" -> falls through to 4a as a new record.
//     User choice B: "Duplicate — keep existing photo" ->
    await fetch('/functions/v1/save-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchedId: matches[0].id, replaceImage: false, personal_notes }),
    });
    // new_quality_score / compressedBlob are discarded client-side, never uploaded.

//     User choice C: "Duplicate — replace with new photo" ->
    await fetch('/functions/v1/save-duplicate', {
        method: 'POST',
        body: buildMultipart({ matchedId: matches[0].id, replaceImage: true, personal_notes, image: compressedBlob, new_quality_score }),
    });

// 5. To display a saved record's photo later, request a signed URL:
const { signedUrl } = await fetch(`/functions/v1/coin-image/${id}`).then(r => r.json());
```

#### 5.2 Edge Function: `extract-coin`

```javascript
// Runs server-side; holds GEMINI_API_KEY as a secret env var.
Deno.serve(async (req) => {
    const imageBytes = await req.arrayBuffer();

    // Pass 1: free-text extraction.
    const { image_quality_score, ...fields } = await callGemini(apiKey, imageBytes, mimeType);
    // fields = { country, denomination, mint_year, mint_mark }

    // Pass 2 (§3.7): if marks are already on file for this country, re-examine
    // the same image constrained to that known set instead of trusting the
    // free-text guess. Skipped (no extra Gemini call) if none are on file yet.
    const knownMarks = await supabaseAdmin.from('mints').select('mint_mark').ilike('country', fields.country);
    if (knownMarks.length > 0) {
        fields.mint_mark = await callGeminiMintMatch(apiKey, imageBytes, mimeType, fields.country, knownMarks);
    }

    // Resolve mint_id/mint_name server-side so the review step doesn't need
    // an extra round trip for the common (unedited) case.
    const mint = fields.mint_mark
        ? await supabaseAdmin.from('mints').select('id, mint_name')
              .ilike('country', fields.country).ilike('mint_mark', fields.mint_mark).maybeSingle()
        : null;

    return Response.json({ fields, image_quality_score, mint_id: mint?.id ?? null, mint_name: mint?.mint_name ?? null });
});
```

#### 5.3 Edge Function: `check-duplicate`

```javascript
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

Deno.serve(async (req) => {
    const { country, denomination, mint_year, mint_mark } = await req.json();

    let query = supabase
        .from('personal_coins')
        .select('id, image_path, image_quality_score, personal_notes, album_id, page_number, pocket_number')
        .eq('country', country)
        .eq('denomination', denomination);

    query = mint_year == null ? query.is('mint_year', null) : query.eq('mint_year', mint_year);
    query = mint_mark == null ? query.is('mint_mark', null) : query.eq('mint_mark', mint_mark);

    const { data: matches, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Resolve short-lived signed URLs for thumbnails before returning.
    const withThumbs = await Promise.all(matches.map(async (m) => ({
        ...m,
        thumbnail_url: (await supabase.storage.from('coin-photos').createSignedUrl(m.image_path, 3600)).data?.signedUrl,
    })));

    return Response.json({ matches: withThumbs });
});
```

#### 5.4 Edge Function: `save-coin`

```javascript
// Runs server-side; holds SUPABASE_SERVICE_ROLE_KEY as a secret env var.
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

Deno.serve(async (req) => {
    const { country, denomination, mint_year, mint_mark, personal_notes, image, new_quality_score } = await parseMultipart(req);

    const imagePath = `coin_${Date.now()}_${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
        .from('coin-photos')
        .upload(imagePath, image, { contentType: 'image/jpeg' });
    if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

    const { data, error: insertError } = await supabase
        .from('personal_coins')
        .insert([{ country, denomination, mint_year, mint_mark, personal_notes, image_path: imagePath, image_quality_score: new_quality_score }])
        .select('id')
        .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

    return Response.json({ id: data.id });
});
```

#### 5.5 Edge Function: `save-duplicate`

```javascript
// Runs server-side; holds SUPABASE_SERVICE_ROLE_KEY as a secret env var.
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

Deno.serve(async (req) => {
    const { matchedId, replaceImage, personal_notes, image, new_quality_score } = await parseMultipart(req);

    const { data: existing, error: fetchError } = await supabase
        .from('personal_coins')
        .select('id, image_path, quantity, personal_notes')
        .eq('id', matchedId)
        .single();
    if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });

    const updates = {
        quantity: existing.quantity + 1,
        personal_notes: personal_notes
            ? [existing.personal_notes, personal_notes].filter(Boolean).join('\n')
            : existing.personal_notes,
    };

    // Only touch Storage if the user explicitly chose to replace the photo.
    // "Keep existing" never uploads the new image at all.
    if (replaceImage) {
        const newImagePath = `coin_${Date.now()}_${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
            .from('coin-photos')
            .upload(newImagePath, image, { contentType: 'image/jpeg' });
        if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

        await supabase.storage.from('coin-photos').remove([existing.image_path]);
        updates.image_path = newImagePath;
        updates.image_quality_score = new_quality_score;
    }

    // Note: album_id / page_number / pocket_number are intentionally NOT
    // touched here — duplicates never get their own album placement (§3.6).
    const { error: updateError } = await supabase
        .from('personal_coins')
        .update(updates)
        .eq('id', matchedId);
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    return Response.json({ id: matchedId, quantity: updates.quantity });
});
```

### 6. Open Items / Explicitly Out of Scope
*   **Auth:** None. Anyone with the URL can use the app. Acceptable per personal-use requirement; revisit if the URL is ever shared or the app is exposed beyond a private link.
*   **Offline support:** Not required initially — assume the device has connectivity when logging a coin.
*   **Edit/delete of existing records:** Needed at minimum to attach album placement (§3.6) after the fact — a coin is captured/saved first, placed in an album later. Detail view with edit is now in scope; hard delete UX still undecided.
*   **List/search view:** PRD covers capture → extract → review → save; a browsing/search UI for the saved collection (including "which coins have no album placement yet") is a near-term follow-up, not this spec.
*   **Album details:** user does not yet have the physical album specs (pages × pockets) and needs to locate them — not blocking, since §3.6 deliberately uses free-form sequential `page_number`/`pocket_number` rather than a fixed layout, so no schema change is needed once albums are known; the user just starts populating the `albums` table and placement fields whenever ready.
*   **Rate limiting / abuse protection on the Edge Functions:** Since there's no auth, consider a simple shared-secret header or Supabase's built-in JWT check on the functions to stop randomly-discovered URLs from burning Gemini quota.
