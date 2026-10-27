-- Wellbeing check-ins (Oct 2026; a gap the FootballPro comparison showed). A parent can tell the club how their child
-- is feeling about football (good / OK / not great) and, if they want, add a private note. It's special-category data
-- (children's wellbeing), so: given only with the parent's explicit consent each time, readable by the child's own
-- parents and the club's admins (the welfare lead) only, never coaches or other families; "not great" or a note alerts
-- the admins by email without the words; an admin marks it followed up. Forward-only and additive.

create table wellbeing_checkins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  mood text not null check (mood in ('good', 'ok', 'low')),
  note text check (note is null or char_length(note) between 1 and 500),
  given_by uuid references guardians (id) on delete set null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Set when the admins have been emailed about it (only "low" or with a note); null = not needed or not sent yet.
  alerted_at timestamptz,
  followed_up_at timestamptz,
  followed_up_by uuid references staff (id) on delete set null
);
create index wellbeing_checkins_player_idx on wellbeing_checkins (player_id, created_at desc);
create index wellbeing_checkins_open_idx on wellbeing_checkins (created_at) where followed_up_at is null and (mood = 'low' or note is not null);

alter table wellbeing_checkins enable row level security;
create policy "family reads own wellbeing" on wellbeing_checkins for select using (player_id in (select my_player_ids()));
create policy "admins read wellbeing" on wellbeing_checkins for select using (is_admin());
create policy "admins follow up wellbeing" on wellbeing_checkins for update using (is_admin()) with check (is_admin());
grant select on wellbeing_checkins to authenticated;
grant update (followed_up_at, followed_up_by) on wellbeing_checkins to authenticated;

-- A parent checks in for their own child, with consent ticked. At most one a day per child (a second replaces it).
create function give_wellbeing_checkin(p_player uuid, p_mood text, p_note text, p_consent boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_player not in (select my_player_ids()) then raise exception 'not your child'; end if;
  if not coalesce(p_consent, false) then raise exception 'consent needed'; end if;
  if p_mood not in ('good', 'ok', 'low') then raise exception 'unknown mood'; end if;
  delete from wellbeing_checkins
    where player_id = p_player and followed_up_at is null
      and (created_at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date;
  insert into wellbeing_checkins (player_id, mood, note, given_by, consent_at)
  values (p_player, p_mood, nullif(trim(p_note), ''), my_guardian_id(), now())
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function give_wellbeing_checkin(uuid, text, text, boolean) from public;
grant execute on function give_wellbeing_checkin(uuid, text, text, boolean) to authenticated;
