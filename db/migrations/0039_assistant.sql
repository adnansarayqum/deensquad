-- The admins' assistant (Oct 2026, the owner's request): Claude answers questions from the app's own data and drafts
-- changes (add sessions, cancel a session, post news), which happen only when the admin taps Confirm. Each draft is
-- kept here, made by the server from checked input, so Confirm sends only its id and the change is exactly what was
-- shown. Done or dismissed once; drafts older than a day can't be confirmed. Forward-only and additive.

create function my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from staff where auth_user_id = auth.uid()
$$;
grant execute on function my_staff_id() to authenticated;

create table assistant_actions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id) on delete cascade,
  kind text not null check (kind in ('add_sessions', 'cancel_session', 'post_news')),
  payload jsonb not null,
  summary text not null check (char_length(summary) between 1 and 300),
  created_at timestamptz not null default now(),
  -- Set once: confirmed (with the result in words) or dismissed.
  done_at timestamptz,
  dismissed boolean not null default false,
  result text
);
create index assistant_actions_staff_idx on assistant_actions (staff_id, created_at desc);

alter table assistant_actions enable row level security;
-- Admins only, and each sees only their own drafts.
create policy "admins keep their own drafts" on assistant_actions for all
  using (is_admin() and staff_id = my_staff_id())
  with check (is_admin() and staff_id = my_staff_id());
grant select, insert on assistant_actions to authenticated;
grant update (done_at, dismissed, result) on assistant_actions to authenticated;
