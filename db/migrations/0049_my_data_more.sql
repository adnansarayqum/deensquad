-- Download my data (privacy review, 14 Nov 2026): the copy a parent downloads left out a few things the app holds
-- about them that they can't read themselves under row level security. Each function below gives a signed-in
-- parent their own rows only, and nothing about anyone else.

-- When they asked for a sign-in code or were sent an invite, and from which internet address (kept 30 days).
create function my_sign_in_records() returns table (asked_at timestamptz, kind text, internet_address text, used_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.created_at, r.purpose, r.ip, r.used_at
  from auth.sign_in_requests r
  join auth.users u on lower(u.email) = lower(r.email)
  where u.id = auth.uid()
  order by r.created_at
$$;
revoke execute on function my_sign_in_records() from public;
grant execute on function my_sign_in_records() to authenticated;

-- The phones and browsers they are signed in on: when each signed in and was last used. Never the session itself.
create function my_signed_in_devices() returns table (signed_in_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.created_at, s.last_seen_at from auth.sessions s
  where s.user_id = auth.uid() and s.expires_at > now()
  order by s.created_at
$$;
revoke execute on function my_signed_in_devices() from public;
grant execute on function my_signed_in_devices() to authenticated;

-- The weekly "Is <child> coming?" reminders sent to them.
create function my_attendance_reminders() returns table (session_title text, starts_at timestamptz, sent_at timestamptz, channel text)
language sql stable security definer set search_path = public as $$
  select s.title, s.starts_at, r.sent_at, r.channel
  from attendance_reminders r join sessions s on s.id = r.session_id
  where r.guardian_id = my_guardian_id()
  order by r.sent_at
$$;
revoke execute on function my_attendance_reminders() from public;
grant execute on function my_attendance_reminders() to authenticated;

-- Their children's points rewards: when the points were reached and when the reward was given.
create function my_children_rewards() returns table (player_id uuid, points int, reached_at timestamptz, rewarded_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.player_id, m.points, m.reached_at, m.rewarded_at
  from points_milestones m
  where m.player_id in (select my_player_ids())
  order by m.reached_at
$$;
revoke execute on function my_children_rewards() from public;
grant execute on function my_children_rewards() to authenticated;

-- Trial sessions booked with their email address before they joined (details are removed 6 months after the trial).
create function my_trial_bookings() returns table (
  child_first_name text, child_last_name text, date_of_birth date, age_group text,
  session_title text, starts_at timestamptz, booked_at timestamptz, arrived_at timestamptz, cancelled_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select b.child_first_name, b.child_last_name, b.date_of_birth, b.age_group::text, s.title, s.starts_at, b.created_at, b.arrived_at, b.cancelled_at
  from trial_bookings b
  join sessions s on s.id = b.session_id
  join auth.users u on lower(u.email) = lower(b.email)
  where u.id = auth.uid() and my_guardian_id() is not null
  order by b.created_at
$$;
revoke execute on function my_trial_bookings() from public;
grant execute on function my_trial_bookings() to authenticated;
