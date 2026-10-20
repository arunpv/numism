-- Index card size per album: the card printed with the album's coin list
-- and stuck inside its front and back covers. Albums vary in size, so each
-- one carries its own. Nullable — measured over time; the card can't be
-- printed for an album until both are set.

alter table albums
    add column card_width_mm numeric(5, 1) check (card_width_mm > 0),
    add column card_height_mm numeric(5, 1) check (card_height_mm > 0);
