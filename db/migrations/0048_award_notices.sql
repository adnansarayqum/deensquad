-- Parents told about stars, points and badges (UX review, 8 Nov 2026: the peak-end rule; the best moment of a
-- parent's week used to go unseen until they opened the Family tab). The hourly cron sends one notification per
-- child once the coaches have finished giving (15 minutes after the last one), and marks what it told.
-- Everything given before this migration counts as told, so nobody gets a backlog. Forward-only and additive.

alter table player_awards add column parents_told_at timestamptz;
update player_awards set parents_told_at = created_at;

alter table player_badges add column given_at timestamptz not null default now();
alter table player_badges add column parents_told_at timestamptz;
update player_badges set given_at = (earned_on::timestamp at time zone 'Europe/London'), parents_told_at = now();

create index player_awards_untold on player_awards (player_id) where parents_told_at is null;
create index player_badges_untold on player_badges (player_id) where parents_told_at is null;
