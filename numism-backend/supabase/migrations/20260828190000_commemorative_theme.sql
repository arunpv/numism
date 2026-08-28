-- Commemorative/special-issue coins share country+denomination+mint_year
-- with the standard circulation coin, so the theme must be part of the
-- duplicate-match identity (see coin_app_requirements.md §3.5) or a
-- commemorative would collide with the plain coin, or two different
-- commemorative designs from the same year would collide with each other.

alter table personal_coins
    add column commemorative_theme text;

drop index if exists idx_personal_coins_dedup;
create index idx_personal_coins_dedup
    on personal_coins (country, denomination, mint_year, mint_mark, commemorative_theme);
