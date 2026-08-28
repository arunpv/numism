-- Capture now takes both sides of the coin (mint marks/dates/commemorative
-- details can appear on either side). image_path stays the front/obverse
-- photo (existing rows are unaffected); image_path_back is the new reverse
-- photo, nullable so old rows (captured before this change) remain valid.

alter table personal_coins
    add column image_path_back text;
