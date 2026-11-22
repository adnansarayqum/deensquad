-- The club's sponsors: a logo, what they sponsor, a link and an offer for families. Shown to everyone signed in
-- (nothing here is about a child or a family), managed by admins only.
create table sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  sponsors_what text check (char_length(sponsors_what) <= 80),
  about text check (char_length(about) <= 300),
  link_url text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 500)),
  offer text check (char_length(offer) <= 200),
  offer_how text check (char_length(offer_how) <= 200),
  logo_file_id uuid references club_files (id) on delete set null,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

alter table sponsors enable row level security;
create policy "signed in reads sponsors on show" on sponsors for select using (auth.uid() is not null and (active or is_admin()));
create policy "admins manage sponsors" on sponsors for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on sponsors to authenticated;

-- A sponsor's logo is a club file anyone signed in may open while the sponsor is on show.
create policy "signed in reads sponsor logos" on club_files for select using (
  auth.uid() is not null and id in (select logo_file_id from sponsors where logo_file_id is not null and active)
);
