-- A parent adds the other parent (or another carer) to their own children from Player → Your family, so the club
-- doesn't have to. Forward-only and additive: two nullable columns and one function, so the previous version of the
-- app runs unchanged on this schema.
--
-- Parents can't write guardians or player_guardians under row level security (staff policies only), so the write
-- goes through a security-definer function that links only the caller's own children. The other parent is found by
-- email (the club's guardians are unique by lower(email)) or added; a new row is linked to an existing sign-in by the
-- `link_auth_user` trigger from 0020. Who added a link and when is kept, for the club and for the daily limit.

alter table player_guardians add column added_by_guardian uuid references guardians (id) on delete set null;
alter table player_guardians add column added_at timestamptz;

-- Returns the other parent's id, whether their row was new, and how many of the children were newly linked to them
-- (0 when they were already a parent of all of them). Refuses: no caller, a blank name, an email that isn't one, the
-- caller's own email, no children or one that isn't the caller's, a child who would have more than 4 parents, and a
-- sixth parent added by the same caller within 24 hours.
create function add_my_co_parent(p_first text, p_last text, p_email text, p_phone text, p_players uuid[])
returns table (guardian_id uuid, created boolean, linked int)
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
  ) >= 5 then
    raise exception 'too many today' using errcode = '54000';
  end if;

  select g.id into v_id from guardians g where lower(g.email) = v_email;
  if v_id is null then
    insert into guardians (first_name, last_name, email, phone) values (v_first, v_last, v_email, v_phone) returning id into v_id;
    v_created := true;
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

  return query select v_id, v_created, v_linked;
end
$$;

revoke execute on function add_my_co_parent(text, text, text, text, uuid[]) from public;
grant execute on function add_my_co_parent(text, text, text, text, uuid[]) to authenticated;
