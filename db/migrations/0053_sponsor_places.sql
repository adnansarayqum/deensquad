-- Sponsors in more places: a small square icon for one-line credits, the logo's own ground colour so a dark logo
-- sits on its own colour instead of a white box, and how many times each sponsor was shown (totals only).
alter table sponsors
  add column icon_file_id uuid references club_files (id) on delete set null,
  add column logo_bg text check (logo_bg is null or logo_bg ~ '^#[0-9a-f]{6}$'),
  add column icon_bg text check (icon_bg is null or icon_bg ~ '^#[0-9a-f]{6}$');

-- The icon is opened like the logo: by anyone signed in, while the sponsor is on show.
drop policy "signed in reads sponsor logos" on club_files;
create policy "signed in reads sponsor logos" on club_files for select using (
  auth.uid() is not null
  and (
    id in (select logo_file_id from sponsors where logo_file_id is not null and active)
    or id in (select icon_file_id from sponsors where icon_file_id is not null and active)
  )
);

-- One row per sponsor, London day and place: a running total of times shown. Nothing says who saw it.
create table sponsor_views (
  sponsor_id uuid not null references sponsors (id) on delete cascade,
  day date not null,
  place text not null check (place in ('home', 'gate', 'page')),
  views integer not null default 0 check (views >= 0),
  primary key (sponsor_id, day, place)
);
alter table sponsor_views enable row level security;
-- Admins read the totals; only the app itself adds to them.
create policy "admins read sponsor views" on sponsor_views for select using (is_admin());
grant select on sponsor_views to authenticated;
