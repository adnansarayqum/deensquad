-- Player ratings (five categories, 1 to 5, given by staff after a session) and monthly progress reports, plus a small
-- table of club settings whose first key, `progress_for_parents`, decides whether parents see either. Nothing is
-- seeded: an absent key is off, so parents see nothing until an admin switches it on (the owner hasn't approved it
-- yet). Forward-only and additive: three new tables and one function, so the previous version of the app runs
-- unchanged on this schema. Depends on nothing after 0023.

-- 1. Club settings: one row per key. Everyone signed in reads them (the parent screens ask whether to show
--    progress); only admins write them.
create table club_settings (
  key text primary key check (key ~ '^[a-z_]{1,60}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references staff (id) on delete set null
);
alter table club_settings enable row level security;
create policy "signed in read settings" on club_settings for select using (auth.uid() is not null);
create policy "admins write settings" on club_settings for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on club_settings to authenticated;

-- True once an admin has switched on ratings and progress reports for parents. Security definer so the policies
-- below can call it whoever is asking; anything but the JSON value true (or no row) is off.
create function progress_visible() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true'::jsonb from club_settings where key = 'progress_for_parents'), false);
$$;

-- 2. Ratings: one row per child per session per member of staff (re-rating the same session updates it). A rating
--    outlives its session (session_id set null) and its rater (rated_by set null); rated_on is the session's London
--    date. Coach scope (own groups only) is enforced in the app, as for points and stars.
create table player_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  session_id uuid references sessions (id) on delete set null,
  rated_on date not null default ((now() at time zone 'Europe/London')::date),
  rated_by uuid references staff (id) on delete set null,
  technique smallint not null check (technique between 1 and 5),
  game_understanding smallint not null check (game_understanding between 1 and 5),
  physical smallint not null check (physical between 1 and 5),
  attitude smallint not null check (attitude between 1 and 5),
  teamwork smallint not null check (teamwork between 1 and 5),
  created_at timestamptz not null default now()
);
create unique index player_ratings_once on player_ratings (player_id, session_id, rated_by) where session_id is not null;
create index player_ratings_player_idx on player_ratings (player_id, rated_on desc);
create index player_ratings_session_idx on player_ratings (session_id);

alter table player_ratings enable row level security;
create policy "staff rate players" on player_ratings for all using (is_staff()) with check (is_staff());
create policy "family reads own ratings when shown" on player_ratings for select
  using (progress_visible() and player_id in (select my_player_ids()));
grant select, insert, update, delete on player_ratings to authenticated;

-- 3. Progress reports: one per child per month (the first of the month), written by staff, published when ready.
--    Parents read only published ones for their own children, and only while progress is switched on.
--    emailed_at: when the parents were told it was ready (once; never for reports published while it was off).
create table progress_reports (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  body text not null check (char_length(body) between 1 and 1500),
  written_by uuid references staff (id) on delete set null,
  published_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, month)
);

alter table progress_reports enable row level security;
create policy "staff write reports" on progress_reports for all using (is_staff()) with check (is_staff());
create policy "family reads own published reports when shown" on progress_reports for select
  using (progress_visible() and published_at is not null and player_id in (select my_player_ids()));
grant select, insert, update, delete on progress_reports to authenticated;

-- 4. "Download my data" includes the parent's own children's ratings and published reports whatever the switch says
--    (their right of access), so it reads them through these, limited to my_player_ids() (a staff parent's own family
--    only), with the rater's or writer's name and nothing else about staff.
create function my_children_ratings() returns table (
  player_id uuid, rated_on date, rated_by text,
  technique smallint, game_understanding smallint, physical smallint, attitude smallint, teamwork smallint
)
language sql stable security definer set search_path = public as $$
  select r.player_id, r.rated_on, s.display_name, r.technique, r.game_understanding, r.physical, r.attitude, r.teamwork
  from player_ratings r left join staff s on s.id = r.rated_by
  where r.player_id in (select my_player_ids())
  order by r.rated_on, r.created_at;
$$;

create function my_children_reports() returns table (player_id uuid, month date, body text, written_by text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.player_id, r.month, r.body, s.display_name, r.published_at
  from progress_reports r left join staff s on s.id = r.written_by
  where r.published_at is not null and r.player_id in (select my_player_ids())
  order by r.month;
$$;
revoke execute on function my_children_ratings(), my_children_reports() from public;
grant execute on function my_children_ratings(), my_children_reports() to authenticated;
