-- Adds structured physical/reference fields (period, value, currency,
-- composition, weight, diameter, thickness, shape, orientation, demonetized)
-- and AI-estimated assessment fields (rarity, estimated value range, grade).
-- All nullable except demonetized (defaults false), so existing rows stay valid.

alter table personal_coins
    add column period text,
    add column value numeric,
    add column currency text,
    add column composition text,
    add column weight_grams numeric,
    add column diameter_mm numeric,
    add column thickness_mm numeric,
    add column shape text,
    add column orientation text,
    add column demonetized boolean not null default false,
    add column rarity text,
    add column estimated_value_low numeric,
    add column estimated_value_high numeric,
    add column grade text;
