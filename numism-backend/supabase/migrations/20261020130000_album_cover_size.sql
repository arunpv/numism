-- Store the album's measured inside-cover size instead of a card size: the
-- card is derived from it when printing (cover minus a margin chosen on the
-- index card screen), so the margin isn't baked into stored data.

alter table albums rename column card_width_mm to cover_width_mm;
alter table albums rename column card_height_mm to cover_height_mm;
