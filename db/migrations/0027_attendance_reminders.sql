-- The weekly "Is <child> coming?" reminder (the owner's request: Wednesdays at 5pm, as Spond did). The hourly cron
-- sends it on the day and from the hour in club_settings 'attendance_reminder' (absent = on, Wednesday, 17:00) to
-- parents of children who haven't answered for their next session in the coming 4 days. One row per parent per
-- session once they've been reached, so nobody is reminded twice about the same session. Written only by the system
-- (the cron, without row level security); staff can read it ("Last sent" on Admin → Sessions).
create table attendance_reminders (
  session_id uuid not null references sessions (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  sent_at timestamptz not null default now(),
  channel text not null check (channel in ('app', 'email')),
  primary key (session_id, guardian_id)
);
create index attendance_reminders_guardian_idx on attendance_reminders (guardian_id);
create index attendance_reminders_sent_idx on attendance_reminders (sent_at desc);
alter table attendance_reminders enable row level security;
create policy "staff read attendance reminders" on attendance_reminders for select using (is_staff());
grant select on attendance_reminders to authenticated;
