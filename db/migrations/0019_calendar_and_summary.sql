-- Two additions, both forward-only and nullable or defaulted, so the previous version of the app runs unchanged on
-- this schema.
--
-- 1. Calendar sync (Player → Calendar): each parent can have one private calendar feed, GET /api/calendar/<token>.ics.
--    Only a SHA-256 hash of the token is kept (like sign-in sessions); the token itself appears only in the link the
--    parent is shown once. Resetting replaces the hash, so the old link stops working. The row goes with the parent.
alter table guardians add column calendar_token_hash text unique;
alter table guardians add column calendar_token_created_at timestamptz;

-- A parent sets (or replaces) their own feed's hash. Only through this: parents can't update guardians directly.
create function set_calendar_token(p_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_guardian uuid := my_guardian_id();
begin
  if v_guardian is null or p_hash is null or length(p_hash) <> 64 then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update guardians set calendar_token_hash = p_hash, calendar_token_created_at = now() where id = v_guardian;
end
$$;
revoke execute on function set_calendar_token(text) from public;
grant execute on function set_calendar_token(text) to authenticated;

-- 2. The owner's monthly summary email: one row per month claimed by the hourly job before sending, so it goes once.
--    `sent_at` is set once at least one admin got it; a claim whose every send failed is deleted so the next run retries.
create table monthly_summaries (
  month date primary key,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
-- Only the system connection (the cron job) touches it.
alter table monthly_summaries enable row level security;
