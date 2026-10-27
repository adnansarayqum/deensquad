-- Away trips and consent (Oct 2026; a gap the FootballPro comparison showed). A match or tournament away from the
-- usual venue gets trip details (where and when to meet, how they travel, when they're back, any cost), and each
-- child's parent says yes or no in the app, with a number to reach them on the day and anything the coaches should
-- know. The coaches see who's cleared to travel. Forward-only and additive.

create table session_trips (
  session_id uuid primary key references sessions (id) on delete cascade,
  meet_at timestamptz not null,
  meet_point text not null check (char_length(meet_point) between 1 and 200),
  return_at timestamptz,
  transport text check (transport is null or char_length(transport) between 1 and 200),
  cost_pence integer check (cost_pence is null or cost_pence between 1 and 100000),
  notes text check (notes is null or char_length(notes) between 1 and 1000),
  updated_by uuid references staff (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table session_trips enable row level security;
create policy "staff manage trips" on session_trips for all using (is_staff()) with check (is_staff());
-- Families read the trip for a session that's for one of their children (their group's, or a squad they're in).
create policy "family reads own trips" on session_trips for select using (
  exists (
    select 1 from sessions s join players p on p.id in (select my_player_ids())
    where s.id = session_trips.session_id and p.age_group = any (s.age_groups) and squad_allows(s.id, p.id)
  )
);
grant select, insert, update, delete on session_trips to authenticated;

create table trip_consents (
  session_id uuid not null references session_trips (session_id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  consent boolean not null,
  day_phone text check (day_phone is null or char_length(day_phone) between 5 and 30),
  note text check (note is null or char_length(note) between 1 and 300),
  answered_by uuid references guardians (id) on delete set null,
  answered_at timestamptz not null default now(),
  primary key (session_id, player_id)
);
alter table trip_consents enable row level security;
create policy "staff read trip consents" on trip_consents for select using (is_staff());
create policy "family reads own trip consents" on trip_consents for select using (player_id in (select my_player_ids()));
-- Written only by give_trip_consent (parents) below; staff read only.
grant select on trip_consents to authenticated;

-- A parent answers for their own child, for a trip on a session that's for that child and hasn't started yet.
create function give_trip_consent(p_session uuid, p_player uuid, p_consent boolean, p_phone text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_player not in (select my_player_ids()) then raise exception 'not your child'; end if;
  if not exists (
    select 1 from session_trips t join sessions s on s.id = t.session_id join players p on p.id = p_player
    where t.session_id = p_session and s.cancelled_at is null and s.starts_at > now()
      and p.age_group = any (s.age_groups) and squad_allows(s.id, p.id)
  ) then raise exception 'trip not open'; end if;
  insert into trip_consents (session_id, player_id, consent, day_phone, note, answered_by, answered_at)
  values (p_session, p_player, p_consent, nullif(trim(p_phone), ''), nullif(trim(p_note), ''), my_guardian_id(), now())
  on conflict (session_id, player_id) do update
    set consent = excluded.consent, day_phone = excluded.day_phone, note = excluded.note, answered_by = excluded.answered_by, answered_at = excluded.answered_at;
end;
$$;
revoke execute on function give_trip_consent(uuid, uuid, boolean, text, text) from public;
grant execute on function give_trip_consent(uuid, uuid, boolean, text, text) to authenticated;
