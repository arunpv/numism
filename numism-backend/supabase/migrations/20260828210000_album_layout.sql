-- Album layout is now known enough to track capacity (coin_app_requirements.md
-- §3.6 originally deferred this). Uniform layout per album: one pocket count
-- applies to every page. Both nullable so existing albums without specs yet
-- remain valid; capacity is only enforced (see update-coin) once both are set.

alter table albums
    add column num_pages int2,
    add column pockets_per_page int2;
