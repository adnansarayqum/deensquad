-- The club's real groups: U6 (boys and girls), U7, U10 (ages 8–10), U12 (11–12) and U15 (13–15).
-- The old U9, U11 and U13 values stay in the type (Postgres can't drop enum values) but the app no longer offers them.
alter type age_group add value if not exists 'U6' before 'U7';
alter type age_group add value if not exists 'U10' before 'U11';
alter type age_group add value if not exists 'U12' before 'U13';
