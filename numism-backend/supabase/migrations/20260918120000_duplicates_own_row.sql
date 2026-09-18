-- Duplicates get their own row instead of bumping a quantity counter (see
-- coin_app_requirements.md §3.5 rewrite) — each owned specimen is now a real
-- personal_coins row, sharing a photo (image_path/image_path_back) with
-- other rows of the same identity rather than each needing its own upload.
-- `quantity` becomes meaningless once every specimen has its own row (owned
-- count is just "how many rows share this identity"), so it's dropped.

-- Split every existing quantity>1 row into that many rows: the original
-- keeps its id, notes, and album placement; the split-off copies share its
-- photo and notes but start unplaced (only one physical specimen can occupy
-- a given album pocket, so placement doesn't carry over automatically).
insert into personal_coins (
    country, denomination, mint_year, mint_mark, mint_mark_position, mint_id,
    commemorative_theme, image_path, image_path_back, image_quality_score,
    personal_notes, period, value, currency, composition, weight_grams,
    diameter_mm, thickness_mm, shape, orientation, demonetized, rarity,
    estimated_value_low, estimated_value_high, grade
)
select
    p.country, p.denomination, p.mint_year, p.mint_mark, p.mint_mark_position, p.mint_id,
    p.commemorative_theme, p.image_path, p.image_path_back, p.image_quality_score,
    p.personal_notes, p.period, p.value, p.currency, p.composition, p.weight_grams,
    p.diameter_mm, p.thickness_mm, p.shape, p.orientation, p.demonetized, p.rarity,
    p.estimated_value_low, p.estimated_value_high, p.grade
from personal_coins p, generate_series(2, p.quantity) as extra
where p.quantity > 1;

alter table personal_coins drop column quantity;
