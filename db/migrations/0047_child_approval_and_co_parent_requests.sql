-- Two safeguards from the security review (3 Nov 2026), both the owner's decisions:
--
-- 1. A child added by a parent (self sign-up, or Add a child) waits for an admin to approve them before their family
--    sees that child's group: its news (and club-wide news), sessions, plans, practice sheets and the photos and videos
--    on them. Until then the family can sign in and do the To-do. Children the club adds (import, admin screens) are
--    approved as they're added, and every child already in the app is approved by this migration.
--    `my_age_groups()` counts approved children only, and the policies that let any signed-in family read club-wide
--    news or every-group practice sheets now need at least one approved child.
--
-- 2. "Add a parent or carer" no longer links an email that already belongs to a parent in the app (that showed a
--    stranger the club's name for them, and attached them to someone else's child). The request is kept for the
--    admins, who link them from the child's page; the parent sees the same message either way.
--
-- Forward-only. Rolling the code back leaves new self-signed-up children unapproved; approve them first
-- (`update players set approved_at = now() where approved_at is null`).

alter table players add column approved_at timestamptz default now();
alter table players add column approved_by uuid references staff (id) on delete set null;

-- A child inserted by a parent (auth.uid() set, not staff: add_my_child runs as the parent) starts unapproved.
-- Self sign-up runs as the system and sets approved_at = null itself.
create function players_parent_added_unapproved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end
$$;
create trigger players_parent_added_unapproved before insert on players
  for each row execute function players_parent_added_unapproved();

create or replace function my_age_groups() returns age_group[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p.age_group), '{}') from players p
  where p.id in (select my_player_ids()) and p.approved_at is not null;
$$;

drop policy "family reads announcements" on announcements;
create policy "family reads announcements" on announcements for select using (
  is_staff() or case
    when squad_session_id is not null then in_my_squad(squad_session_id)
    when to_children then exists (
      select 1 from announcement_players ap where ap.announcement_id = announcements.id and ap.player_id in (select my_player_ids())
    )
    -- club-wide news only for a family with an approved child
    else ((audience is null or cardinality(audience) = 0) and cardinality(my_age_groups()) > 0) or audience && my_age_groups()
  end
);

drop policy "family reads own groups' sheets" on practice_sheets;
create policy "family reads own groups' sheets" on practice_sheets for select
  using (is_staff() or (cardinality(age_groups) = 0 and cardinality(my_age_groups()) > 0) or age_groups && my_age_groups());

-- Requests to add a parent whose email the club already has. Admins read and close them; parents write only through
-- add_my_co_parent.
create table co_parent_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references guardians (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  players uuid[] not null,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index co_parent_requests_open_idx on co_parent_requests (created_at) where handled_at is null;
alter table co_parent_requests enable row level security;
create policy "admins read parent requests" on co_parent_requests for select using (is_admin());
create policy "admins close parent requests" on co_parent_requests for update using (is_admin()) with check (is_admin());
grant select on co_parent_requests to authenticated;
grant update (handled_at) on co_parent_requests to authenticated;

-- As 0029, plus `pending`: an email that already belongs to a parent who shares none of these children with the
-- caller isn't linked; the request is kept for the admins instead. A parent who already shares a child with the
-- caller (the same family) is still linked to the others straight away.
drop function add_my_co_parent(text, text, text, text, uuid[]);
create function add_my_co_parent(p_first text, p_last text, p_email text, p_phone text, p_players uuid[])
returns table (guardian_id uuid, created boolean, linked int, pending boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := my_guardian_id();
  v_first text := parent_name_text(p_first);
  v_last text := parent_name_text(p_last);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := nullif(left(trim(coalesce(p_phone, '')), 30), '');
  v_id uuid;
  v_created boolean := false;
  v_linked int := 0;
  v_player uuid;
begin
  if v_me is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_first = '' or v_last = '' then raise exception 'invalid name' using errcode = '22023'; end if;
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  if exists (select 1 from guardians where id = v_me and lower(email) = v_email) then
    raise exception 'own email' using errcode = '22023';
  end if;
  if p_players is null or cardinality(p_players) = 0 or cardinality(p_players) > 20 then
    raise exception 'no children' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_players) as c(id) where c.id is null or not (c.id in (select my_player_ids()))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (
    select count(distinct pg.guardian_id) from player_guardians pg
    where pg.added_by_guardian = v_me and pg.added_at > now() - interval '24 hours'
  ) + (
    select count(*) from co_parent_requests r where r.requested_by = v_me and r.created_at > now() - interval '24 hours'
  ) >= 5 then
    raise exception 'too many today' using errcode = '54000';
  end if;

  select g.id into v_id from guardians g where lower(g.email) = v_email;
  if v_id is null then
    insert into guardians (first_name, last_name, email, phone) values (v_first, v_last, v_email, v_phone) returning id into v_id;
    v_created := true;
  elsif not exists (
    select 1 from player_guardians pg where pg.guardian_id = v_id and pg.player_id in (select my_player_ids())
  ) then
    -- Someone the club already has, from another family: the admins decide.
    insert into co_parent_requests (requested_by, guardian_id, players, first_name, last_name)
    values (v_me, v_id, p_players, v_first, v_last);
    return query select v_id, false, 0, true;
    return;
  end if;

  foreach v_player in array p_players loop
    if not exists (select 1 from player_guardians where player_id = v_player and player_guardians.guardian_id = v_id) then
      if (select count(*) from player_guardians where player_id = v_player) >= 4 then
        raise exception 'too many parents' using errcode = '54000';
      end if;
      insert into player_guardians (player_id, guardian_id, added_by_guardian, added_at) values (v_player, v_id, v_me, now());
      v_linked := v_linked + 1;
    end if;
  end loop;

  return query select v_id, v_created, v_linked, false;
end
$$;

revoke execute on function add_my_co_parent(text, text, text, text, uuid[]) from public;
grant execute on function add_my_co_parent(text, text, text, text, uuid[]) to authenticated;

-- The caller's own open requests, so Add a parent or carer lists them as invited, the same as a new parent (the
-- page then reads the same whether or not the email was already in the app). Only the name the caller typed.
create function my_co_parent_requests() returns table (first_name text, last_name text, players uuid[], created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.first_name, r.last_name, r.players, r.created_at from co_parent_requests r
  where r.requested_by = my_guardian_id() and r.handled_at is null
  order by r.created_at
$$;
revoke execute on function my_co_parent_requests() from public;
grant execute on function my_co_parent_requests() to authenticated;
