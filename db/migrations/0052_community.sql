-- The Community section (stage 2 of the sponsors and community plan): events anyone signed in can see, and practice
-- sheets an admin chooses to share with everyone ("Coach's corner"). Nothing here is about a child or a family.

-- What's on. A one-off event has its own day; a weekly one repeats on the weekday and time of starts_at until
-- repeat_until (or until an admin hides or removes it).
create table community_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  audience text not null default 'everyone' check (audience in ('everyone', 'brothers', 'sisters', 'children')),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  weekly boolean not null default false,
  repeat_until date,
  venue text check (char_length(venue) <= 120),
  details text check (char_length(details) <= 1000),
  how_to_join text check (char_length(how_to_join) <= 300),
  link_url text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 500)),
  active boolean not null default true,
  created_by uuid references staff (id) on delete set null,
  created_at timestamptz not null default now()
);
create index community_events_starts_idx on community_events (starts_at);

alter table community_events enable row level security;
create policy "signed in reads events on show" on community_events for select using (auth.uid() is not null and (active or is_admin()));
create policy "admins manage events" on community_events for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on community_events to authenticated;

-- Coach's corner: a practice sheet an admin shares with everyone signed in, whatever groups it was written for.
-- Its attachment follows, because the club_files policy reads practice_sheets under these policies.
alter table practice_sheets add column community boolean not null default false;
create policy "signed in reads community sheets" on practice_sheets for select using (auth.uid() is not null and community);
