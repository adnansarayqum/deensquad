-- Ratings and progress reports are on for parents unless an admin has switched them off (the club asked to switch
-- everything on). Switching off stores an explicit false (setProgressForParents), so only "never set" changes meaning.
create or replace function progress_visible() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true'::jsonb from club_settings where key = 'progress_for_parents'), true);
$$;
