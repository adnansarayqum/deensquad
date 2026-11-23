-- Seen, app use and "Mark as read" from a notification (the owner's question, 23 Nov 2026: few parents tap
-- "I've read this", so he can't tell whether they read and don't tap, or don't open the app at all).
--
-- * announcement_views: a post appeared on a parent's screen (its headline scrolled into view on Home). One row per
--   parent and post, the first time. Written by the parent themselves (row level security), only for a post they can
--   read. Staff read them to show Seen / Read / Not seen; a parent reads only their own.
-- * app_opens: one row per parent and London day they opened the app (or came back to it), with how many times.
--   Written only by the system (the app's own route, after checking the sign-in). Staff read them for "Last opened"
--   and the App use page; a parent reads only their own. Kept for a year (the hourly job deletes older rows).
-- * app_use_daily: club-wide totals per day, visits and seconds the app was on screen, with no one's name, so an
--   average visit length can be shown without timing any one parent.
-- * announcement_reads.via: 'notification' when the read came from the notification's "Mark as read" button.

create table announcement_views (
  announcement_id uuid not null references announcements (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (announcement_id, guardian_id)
);
create index announcement_views_guardian_idx on announcement_views (guardian_id);

alter table announcement_views enable row level security;
create policy "guardian marks seen" on announcement_views for insert with check (
  guardian_id = my_guardian_id() and exists (select 1 from announcements a where a.id = announcement_id)
);
create policy "guardian and staff read seen" on announcement_views for select using (guardian_id = my_guardian_id() or is_staff());
grant select, insert on announcement_views to authenticated;

create table app_opens (
  guardian_id uuid not null references guardians (id) on delete cascade,
  day date not null,
  opens int not null default 1 check (opens > 0),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (guardian_id, day)
);
create index app_opens_day_idx on app_opens (day);

alter table app_opens enable row level security;
create policy "guardian and staff read app opens" on app_opens for select using (guardian_id = my_guardian_id() or is_staff());
grant select on app_opens to authenticated;

create table app_use_daily (
  day date primary key,
  visits int not null default 0 check (visits >= 0),
  seconds bigint not null default 0 check (seconds >= 0)
);
alter table app_use_daily enable row level security;
create policy "staff read app use" on app_use_daily for select using (is_staff());
grant select on app_use_daily to authenticated;

alter table announcement_reads add column via text check (via in ('app', 'notification'));
