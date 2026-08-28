-- Optional reference photo per mint mark, for marks that can't be reliably
-- described in words/Unicode (see coin_app_requirements.md §3.7 discussion).
-- Text mint_mark stays the authoritative match key; this is a visual aid
-- shown alongside it during Mints management and Capture review.

alter table mints
    add column mark_image_path text;

insert into storage.buckets (id, name, public)
values ('mint-marks', 'mint-marks', false)
on conflict (id) do nothing;
-- Bucket is private; reads go through signed URLs minted by manage-reference
-- (list) and extract-coin/resolve-mint (capture review), same pattern as
-- coin-photos.
