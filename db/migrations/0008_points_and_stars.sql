-- Points and stars, given by coaches (for their own groups) and admins. A row is one award:
-- a star (star player of the session) and/or some points, with an optional reason parents see.
create table player_awards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  stars int not null default 0 check (stars between 0 and 1),
  points int not null default 0 check (points between 0 and 50),
  reason text check (char_length(reason) <= 200),
  awarded_by uuid references staff (id) on delete set null,
  created_at timestamptz not null default now(),
  check (stars + points > 0)
);
create index player_awards_player_idx on player_awards (player_id, created_at desc);

alter table player_awards enable row level security;
create policy "family reads own awards" on player_awards for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff give awards" on player_awards for all using (is_staff()) with check (is_staff());
grant select, insert, update, delete on player_awards to authenticated;
