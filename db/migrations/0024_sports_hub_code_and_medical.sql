-- Two things parents keep in the app for themselves:
--   1. their own entry QR code for the sports hub (Bobby Moore Sports Hub, Parsloes Park), kept beside the children's
--      attendance QR codes so nobody digs through their photos at the gate. Personal to the parent: staff never see it.
--   2. each child's medical and additional needs (conditions, allergies, medication, how the coaches can help), given
--      with the parent's explicit consent and seen only by the child's own parents, the coaches of the child's group
--      and the club's admins (the owner's decision).
-- Forward-only and additive: two new tables, functions, a trigger and the two club_files policies narrowed for staff,
-- so the previous version of the app runs unchanged on this schema. Doesn't depend on 0025 or 0026.

-- 1. The sports hub entry code -------------------------------------------------------------------------------------

-- One row per parent: either the text inside their QR code (read from a screenshot on the phone, drawn again by the
-- app) or, when it couldn't be read, the screenshot itself (a club_files row). Never both.
create table guardian_venue_passes (
  guardian_id uuid primary key references guardians (id) on delete cascade,
  code_text text check (char_length(code_text) between 1 and 1000),
  image_file_id uuid references club_files (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index guardian_venue_passes_image_idx on guardian_venue_passes (image_file_id) where image_file_id is not null;

alter table guardian_venue_passes enable row level security;
-- Read: the parent's own row only. No write grant at all: writes go through the functions below, so nobody can point
-- the row at a file that isn't theirs (which would hide it from staff and delete it on Remove).
create policy "parent reads own sports hub code" on guardian_venue_passes for select using (guardian_id = my_guardian_id());
grant select on guardian_venue_passes to authenticated;

-- True when a stored file is someone's sports hub screenshot. Security definer, so the club_files policies can ask
-- about every parent's row (row level security would otherwise show staff none, and so hide nothing from them).
create function is_venue_pass_file(p_file uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardian_venue_passes where image_file_id = p_file);
$$;

-- Who can open a stored file: as in 0023, except that a parent's sports hub screenshot is theirs alone (staff
-- included: it's the parent's own code, not the club's).
drop policy "family reads files it can see" on club_files;
create policy "family reads files it can see" on club_files for select using (
  (is_staff() and not is_venue_pass_file(id))
  or id in (select file_id from session_plans where file_id is not null)
  or id in (select file_id from practice_sheets where file_id is not null)
  or id in (select image_file_id from shop_products where image_file_id is not null and active)
  or id in (select photo_file_id from players where photo_file_id is not null and id in (select my_player_ids()))
  or id in (select image_file_id from guardian_venue_passes where image_file_id is not null and guardian_id = my_guardian_id())
);
-- As in 0010 ("for all" also reads), minus the sports hub screenshots.
drop policy "staff manage files" on club_files;
create policy "staff manage files" on club_files for all using (is_staff() and not is_venue_pass_file(id)) with check (is_staff());

-- A replaced or removed screenshot never stays behind (also when the parent is deleted: the row cascades).
create function delete_old_venue_pass_file() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.image_file_id is not null and (tg_op = 'DELETE' or old.image_file_id is distinct from new.image_file_id) then
    delete from club_files where id = old.image_file_id;
  end if;
  return null;
end
$$;
create trigger guardian_venue_passes_file_cleanup after delete or update of image_file_id on guardian_venue_passes
  for each row execute function delete_old_venue_pass_file();

-- The parent saves the text read from their code (kept exactly as read; at most 1000 characters). Replaces a
-- screenshot saved before (the trigger deletes its file).
create function set_my_venue_pass(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
begin
  if v_guardian is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_text is null or trim(p_text) = '' or char_length(p_text) > 1000 then raise exception 'invalid code' using errcode = '22023'; end if;
  insert into guardian_venue_passes (guardian_id, code_text, image_file_id, updated_at) values (v_guardian, p_text, null, now())
  on conflict (guardian_id) do update set code_text = excluded.code_text, image_file_id = null, updated_at = now();
end
$$;

-- The parent saves a screenshot the phone couldn't read (already re-encoded by the app). Returns the new file's id.
create function set_my_venue_pass_image(p_mime text, p_data bytea) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
  v_id uuid;
begin
  if v_guardian is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'invalid image' using errcode = '22023'; end if;
  if p_data is null or octet_length(p_data) = 0 then raise exception 'invalid image' using errcode = '22023'; end if;
  insert into club_files (name, mime, size, data, uploaded_by)
  values (case p_mime when 'image/png' then 'sports-hub-code.png' when 'image/webp' then 'sports-hub-code.webp' else 'sports-hub-code.jpg' end,
          p_mime, octet_length(p_data), p_data, null)
  returning id into v_id;
  insert into guardian_venue_passes (guardian_id, code_text, image_file_id, updated_at) values (v_guardian, null, v_id, now())
  on conflict (guardian_id) do update set code_text = null, image_file_id = excluded.image_file_id, updated_at = now();
  return v_id;
end
$$;

-- The parent removes their code (and its screenshot, by the trigger).
create function clear_my_venue_pass() returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_guardian_id() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from guardian_venue_passes where guardian_id = my_guardian_id();
end
$$;

-- 2. Medical and additional needs ----------------------------------------------------------------------------------

-- One row per child, written only by the child's own parents, with their consent (consent_at: when they last ticked
-- it, i.e. their last save). Each field trimmed, at most 500 characters, and at least one filled in.
create table player_medical (
  player_id uuid primary key references players (id) on delete cascade,
  conditions text check (char_length(conditions) between 1 and 500),
  allergies text check (char_length(allergies) between 1 and 500),
  medication text check (char_length(medication) between 1 and 500),
  how_to_help text check (char_length(how_to_help) between 1 and 500),
  consent_at timestamptz not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references guardians (id) on delete set null,
  check (num_nonnulls(conditions, allergies, medication, how_to_help) > 0)
);

-- Staff who may read a child's medical information: admins, and coaches of the child's group (a coach with no groups
-- ticked coaches every group, as everywhere else). Not other coaches: they don't see even that there is some.
create function can_see_medical(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff s join players p on p.id = p_player
    where s.auth_user_id = auth.uid()
      and (s.role = 'admin' or cardinality(s.age_groups) = 0 or p.age_group = any (s.age_groups))
  );
$$;

alter table player_medical enable row level security;
-- Read only: the child's own parents and the staff above. Nobody writes the table directly (no write grant):
-- parents through the functions below, and staff never (the parents own it).
create policy "family and the child's coaches read medical" on player_medical for select
  using (player_id in (select my_player_ids()) or can_see_medical(player_id));
grant select on player_medical to authenticated;

-- A parent saves their own child's medical information. Refused for anyone else's child, and without consent;
-- every field blank removes it. Each save records the consent again.
create function set_my_child_medical(
  p_player uuid, p_conditions text, p_allergies text, p_medication text, p_how_to_help text, p_consent boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_conditions text := nullif(trim(coalesce(p_conditions, '')), '');
  v_allergies text := nullif(trim(coalesce(p_allergies, '')), '');
  v_medication text := nullif(trim(coalesce(p_medication, '')), '');
  v_help text := nullif(trim(coalesce(p_how_to_help, '')), '');
begin
  if my_guardian_id() is null or p_player is null or not (p_player in (select my_player_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if num_nonnulls(v_conditions, v_allergies, v_medication, v_help) = 0 then
    delete from player_medical where player_id = p_player;
    return;
  end if;
  if p_consent is not true then raise exception 'consent needed' using errcode = '22023'; end if;
  if greatest(char_length(v_conditions), char_length(v_allergies), char_length(v_medication), char_length(v_help)) > 500 then
    raise exception 'too long' using errcode = '22023';
  end if;
  insert into player_medical (player_id, conditions, allergies, medication, how_to_help, consent_at, updated_at, updated_by)
  values (p_player, v_conditions, v_allergies, v_medication, v_help, now(), now(), my_guardian_id())
  on conflict (player_id) do update
    set conditions = excluded.conditions, allergies = excluded.allergies, medication = excluded.medication,
        how_to_help = excluded.how_to_help, consent_at = excluded.consent_at, updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end
$$;

-- A parent removes all of their own child's medical information.
create function clear_my_child_medical(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_guardian_id() is null or p_player is null or not (p_player in (select my_player_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from player_medical where player_id = p_player;
end
$$;

revoke execute on function is_venue_pass_file(uuid), delete_old_venue_pass_file(), set_my_venue_pass(text),
  set_my_venue_pass_image(text, bytea), clear_my_venue_pass(), can_see_medical(uuid),
  set_my_child_medical(uuid, text, text, text, text, boolean), clear_my_child_medical(uuid) from public;
grant execute on function is_venue_pass_file(uuid), set_my_venue_pass(text), set_my_venue_pass_image(text, bytea), clear_my_venue_pass(),
  can_see_medical(uuid), set_my_child_medical(uuid, text, text, text, text, boolean), clear_my_child_medical(uuid)
  to authenticated;
