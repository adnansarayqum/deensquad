-- Session plans (what each group will do at a session) and home practice sheets, posted by coaches
-- and admins, with an optional attached PDF or photo. Files are small, so they live in Postgres.

create table club_files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size int not null check (size > 0 and size <= 8388608),
  data bytea not null,
  uploaded_by uuid references staff (id) on delete set null,
  created_at timestamptz not null default now()
);

create table session_plans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  age_group age_group not null,
  body text check (char_length(body) <= 4000),
  file_id uuid references club_files (id) on delete set null,
  author uuid references staff (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (session_id, age_group)
);

create table practice_sheets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 120),
  body text check (char_length(body) <= 4000),
  age_groups age_group[] not null default '{}', -- empty means every group
  file_id uuid references club_files (id) on delete set null,
  posted_by uuid references staff (id) on delete set null,
  created_at timestamptz not null default now()
);
create index practice_sheets_created_idx on practice_sheets (created_at desc);

alter table club_files enable row level security;
alter table session_plans enable row level security;
alter table practice_sheets enable row level security;

create policy "family reads own groups' plans" on session_plans for select using (is_staff() or age_group = any (my_age_groups()));
create policy "staff manage plans" on session_plans for all using (is_staff()) with check (is_staff());

create policy "family reads own groups' sheets" on practice_sheets for select
  using (is_staff() or cardinality(age_groups) = 0 or age_groups && my_age_groups());
create policy "staff manage sheets" on practice_sheets for all using (is_staff()) with check (is_staff());

-- A family can open a file only through a plan or sheet it can already see.
create policy "family reads files it can see" on club_files for select using (
  is_staff()
  or id in (select file_id from session_plans where file_id is not null)
  or id in (select file_id from practice_sheets where file_id is not null)
);
create policy "staff manage files" on club_files for all using (is_staff()) with check (is_staff());

grant select, insert, update, delete on club_files, session_plans, practice_sheets to authenticated;
