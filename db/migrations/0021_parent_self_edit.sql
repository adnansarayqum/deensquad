-- Parents keep their own details and their children's up to date from the Player screen, and add a child.
-- Forward-only and additive: two nullable columns and three functions, so the previous version of the app runs
-- unchanged on this schema. Parents can't write guardians or players under row level security (staff policies
-- only), so each write goes through a security-definer function that touches exactly these columns and nothing
-- else (never email, group, payment or consent), for the caller's own row and children only.

alter table guardians add column updated_by_parent_at timestamptz;
alter table players add column updated_by_parent_at timestamptz;

-- A name as a parent typed it: whitespace collapsed, trimmed, at most 60 characters. Empty is refused by the callers.
create function parent_name_text(p_value text) returns text
language sql immutable set search_path = public as $$
  select left(trim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), 60);
$$;

-- A child's date of birth as a parent may set it: today or earlier, and aged 3 to 18.
create function parent_dob_ok(p_dob date) returns boolean
language sql stable set search_path = public as $$
  select p_dob is not null and p_dob <= current_date - interval '3 years' and p_dob > current_date - interval '19 years';
$$;

-- The parent's own first name, last name and mobile. Not their email: it's their sign-in.
create function update_my_details(p_first text, p_last text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
  v_first text := parent_name_text(p_first);
  v_last text := parent_name_text(p_last);
begin
  if v_guardian is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_first = '' or v_last = '' then raise exception 'invalid name' using errcode = '22023'; end if;
  update guardians
     set first_name = v_first, last_name = v_last, phone = nullif(left(trim(coalesce(p_phone, '')), 30), ''), updated_by_parent_at = now()
   where id = v_guardian;
end
$$;

-- One of the parent's own children: first name, last name and date of birth. Never the group (the club places
-- children), shirt number, position, consent or anything else on the row.
create function update_my_child(p_player uuid, p_first text, p_last text, p_dob date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_first text := parent_name_text(p_first);
  v_last text := parent_name_text(p_last);
begin
  if my_guardian_id() is null or p_player is null or not (p_player in (select my_player_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_first = '' or v_last = '' then raise exception 'invalid name' using errcode = '22023'; end if;
  if not parent_dob_ok(p_dob) then raise exception 'invalid date of birth' using errcode = '22023'; end if;
  update players set first_name = v_first, last_name = v_last, date_of_birth = p_dob, updated_by_parent_at = now() where id = p_player;
end
$$;

-- A new child for the calling parent, linked to them alone (the club links any other parent). Only the groups the
-- club offers today (the retired U9/U11/U13 values stay in the type but aren't offered); a child with the same first
-- name and date of birth already on the parent's account is refused. Joined today, London time. Returns the new id.
create function add_my_child(p_first text, p_last text, p_dob date, p_group text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
  v_first text := parent_name_text(p_first);
  v_last text := parent_name_text(p_last);
  v_group age_group;
  v_id uuid;
begin
  if v_guardian is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_first = '' or v_last = '' then raise exception 'invalid name' using errcode = '22023'; end if;
  if not parent_dob_ok(p_dob) then raise exception 'invalid date of birth' using errcode = '22023'; end if;
  if p_group is null or p_group in ('U9', 'U11', 'U13') then raise exception 'invalid group' using errcode = '22023'; end if;
  v_group := p_group::age_group; -- an unknown value fails the cast
  if exists (
    select 1 from players p where p.id in (select my_player_ids()) and lower(p.first_name) = lower(v_first) and p.date_of_birth = p_dob
  ) then
    raise exception 'duplicate child' using errcode = '23505';
  end if;
  insert into players (first_name, last_name, date_of_birth, age_group, joined_on, updated_by_parent_at)
  values (v_first, v_last, p_dob, v_group, (now() at time zone 'Europe/London')::date, now())
  returning id into v_id;
  insert into player_guardians (player_id, guardian_id) values (v_id, v_guardian);
  return v_id;
end
$$;

revoke execute on function parent_name_text(text), parent_dob_ok(date), update_my_details(text, text, text),
  update_my_child(uuid, text, text, date), add_my_child(text, text, date, text) from public;
grant execute on function update_my_details(text, text, text), update_my_child(uuid, text, text, date), add_my_child(text, text, date, text)
  to authenticated;
