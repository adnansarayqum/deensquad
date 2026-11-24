-- "Wow" features from the end-to-end verdict (24 Nov 2026).
--
-- * attendance.parents_told_at: when the child's parents were told "Musa is checked in" by app notification. Every
--   check-in before this migration is marked told, so nothing old is ever sent.
-- * player_spotlights: Player of the week, one per group and week (the Monday it starts), with the coach's words.
--   Staff manage them (coach scope in the app, as awards); a family reads only its own children's. The card picture
--   is drawn from this row by the app for the child's own parents to share.

alter table attendance add column parents_told_at timestamptz;
update attendance set parents_told_at = checked_in_at;

create table player_spotlights (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  age_group age_group not null,
  week date not null,
  comment text not null check (char_length(btrim(comment)) between 1 and 200),
  given_by uuid references staff (id) on delete set null,
  created_at timestamptz not null default now(),
  parents_told_at timestamptz,
  unique (week, age_group)
);
create index player_spotlights_player_idx on player_spotlights (player_id);

alter table player_spotlights enable row level security;
create policy "staff manage spotlights" on player_spotlights for all using (is_staff()) with check (is_staff());
create policy "family reads its own spotlights" on player_spotlights for select using (player_id in (select my_player_ids()));
grant select, insert, update, delete on player_spotlights to authenticated;
