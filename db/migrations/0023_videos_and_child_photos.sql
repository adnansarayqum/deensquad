-- YouTube videos on session plans and practice sheets, and a photo of each child that their parent adds for the
-- coaches (shown on the register). Forward-only and additive: nullable columns, one policy widened, a trigger and
-- functions, so the previous version of the app runs unchanged on this schema. Doesn't depend on 0022.

-- A YouTube link a coach added, stored as https://www.youtube.com/watch?v=<id>[&t=<seconds>] (src/lib/video.ts).
alter table session_plans add column video_url text check (char_length(video_url) <= 200);
alter table practice_sheets add column video_url text check (char_length(video_url) <= 200);

-- The child's photo for the coaches: a club_files row that only staff and the child's own parents can read.
-- Only while the family has said yes to photos.
alter table players add column photo_file_id uuid references club_files (id) on delete set null;
alter table players add column photo_updated_at timestamptz;
alter table players add constraint players_photo_needs_consent check (photo_file_id is null or photo_consent is true);

-- Who can open a stored file: staff; a family through a plan or sheet it can see, or the shop; and now a child's
-- photo only by that child's own parents (another parent gets nothing, so /api/files answers 404).
drop policy "family reads files it can see" on club_files;
create policy "family reads files it can see" on club_files for select using (
  is_staff()
  or id in (select file_id from session_plans where file_id is not null)
  or id in (select file_id from practice_sheets where file_id is not null)
  or id in (select image_file_id from shop_products where image_file_id is not null and active)
  or id in (select photo_file_id from players where photo_file_id is not null and id in (select my_player_ids()))
);

-- A replaced, removed or orphaned photo never stays behind: when a child's photo changes or the child is deleted,
-- the old file goes too (whoever did it: the parent, consent turned off, an admin removing the child).
create function delete_old_child_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.photo_file_id is not null and (tg_op = 'DELETE' or old.photo_file_id is distinct from new.photo_file_id) then
    delete from club_files where id = old.photo_file_id;
  end if;
  return null;
end
$$;
create trigger players_child_photo_cleanup after delete or update of photo_file_id on players
  for each row execute function delete_old_child_photo();

-- A parent adds or replaces their own child's photo (already checked and resized by the app). Refused unless the
-- child is theirs and photo consent is yes. Returns the new file's id.
create function set_my_child_photo(p_player uuid, p_mime text, p_data bytea) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_consent boolean;
  v_id uuid;
begin
  if my_guardian_id() is null or p_player is null or not (p_player in (select my_player_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select photo_consent into v_consent from players where id = p_player for update;
  if v_consent is not true then raise exception 'no photo consent' using errcode = '22023'; end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'invalid photo' using errcode = '22023'; end if;
  if p_data is null or octet_length(p_data) = 0 then raise exception 'invalid photo' using errcode = '22023'; end if;
  insert into club_files (name, mime, size, data, uploaded_by)
  values (case p_mime when 'image/png' then 'photo.png' when 'image/webp' then 'photo.webp' else 'photo.jpg' end, p_mime, octet_length(p_data), p_data, null)
  returning id into v_id;
  update players set photo_file_id = v_id, photo_updated_at = now() where id = p_player;
  return v_id;
end
$$;

-- A parent takes their own child's photo off (the file is deleted by the trigger).
create function clear_my_child_photo(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_guardian_id() is null or p_player is null or not (p_player in (select my_player_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update players set photo_file_id = null, photo_updated_at = null where id = p_player and photo_file_id is not null;
end
$$;

-- As in 0002, and now saying no to photos also deletes the child's photo for the coaches (in the same update, so the
-- consent check above always holds). Same signature, so its grants stay.
create or replace function set_photo_consent(p_player uuid, p_consent boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (p_player in (select my_player_ids()) or is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update players
     set photo_consent = p_consent, photo_consent_recorded_at = now(),
         photo_file_id = case when p_consent is true then photo_file_id end,
         photo_updated_at = case when p_consent is true then photo_updated_at end
   where id = p_player;
end
$$;

revoke execute on function delete_old_child_photo(), set_my_child_photo(uuid, text, bytea), clear_my_child_photo(uuid) from public;
grant execute on function set_my_child_photo(uuid, text, bytea), clear_my_child_photo(uuid) to authenticated;
