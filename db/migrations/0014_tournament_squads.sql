-- Tournament squads: staff pick which children play in a session (e.g. 20 of the 40 U10s).
-- A session with any squad rows is a "squad session": only the picked children's families see it,
-- answer for it, get its headcount and its plan. A session with no squad rows works as before.
-- Messages to the squad carry announcements.squad_session_id and reach only the squad's parents,
-- following the squad as it changes (a reserve added later sees them; a child taken out stops seeing them).

create table session_squads (
  session_id uuid not null references sessions (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  added_by uuid references staff (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (session_id, player_id)
);
create index session_squads_player_idx on session_squads (player_id);

-- Deleting the session deletes its squad messages too: with no squad left they'd reach nobody.
alter table announcements add column squad_session_id uuid references sessions (id) on delete cascade;
create index announcements_squad_session_idx on announcements (squad_session_id) where squad_session_id is not null;

-- Security definer, so a family that isn't in the squad still learns the session has one (and is hidden from them).
create function is_squad_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from session_squads where session_id = p_session);
$$;

-- One of the signed-in family's children is in this session's squad.
create function in_my_squad(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from session_squads where session_id = p_session and player_id in (select my_player_ids()));
$$;

-- This child may answer for this session: it has no squad, or the child is in it.
create function squad_allows(p_session uuid, p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from session_squads where session_id = p_session)
    or exists (select 1 from session_squads where session_id = p_session and player_id = p_player);
$$;

alter table session_squads enable row level security;
create policy "family reads own squad places" on session_squads for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff pick squads" on session_squads for all using (is_staff()) with check (is_staff());
grant select, insert, update, delete on session_squads to authenticated;

drop policy "family reads own sessions" on sessions;
create policy "family reads own sessions" on sessions for select using (
  is_staff() or case when is_squad_session(id) then in_my_squad(id) else age_groups && my_age_groups() end
);

drop policy "family answers availability" on availability;
create policy "family answers availability" on availability for all
  using (player_id in (select my_player_ids()) or is_staff())
  with check (
    (player_id in (select my_player_ids()) and exists (select 1 from sessions s where s.id = session_id) and squad_allows(session_id, player_id))
    or is_staff()
  );

drop policy "family reads announcements" on announcements;
create policy "family reads announcements" on announcements for select using (
  is_staff() or case when squad_session_id is not null then in_my_squad(squad_session_id) else audience is null or audience && my_age_groups() end
);

-- A family sees a plan only for a session it can see (the subquery runs under the sessions policy).
drop policy "family reads own groups' plans" on session_plans;
create policy "family reads own groups' plans" on session_plans for select using (
  is_staff() or (age_group = any (my_age_groups()) and exists (select 1 from sessions s where s.id = session_id))
);

-- For a squad session the headcount is the squad's, and only the squad's families get it.
create or replace function squad_counts(p_session uuid, p_age age_group)
returns table (coming int, away int, squad int)
language sql stable security definer set search_path = public as $$
  select
    (count(*) filter (where a.answer = 'coming'))::int,
    (count(*) filter (where a.answer = 'away'))::int,
    count(*)::int
  from players p
  left join availability a on a.player_id = p.id and a.session_id = p_session
  where p.age_group = p_age
    and exists (select 1 from sessions s where s.id = p_session and p_age = any (s.age_groups))
    and (is_staff() or case when is_squad_session(p_session) then in_my_squad(p_session) else p_age = any (my_age_groups()) end)
    and squad_allows(p_session, p.id);
$$;

revoke execute on function is_squad_session(uuid), in_my_squad(uuid), squad_allows(uuid, uuid) from public;
grant execute on function is_squad_session(uuid), in_my_squad(uuid), squad_allows(uuid, uuid) to authenticated;
