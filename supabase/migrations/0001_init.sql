-- Deen Squad: initial schema for the parent app, coach register and admin dashboard.
-- Row level security: a guardian sees only their own family; staff (coaches, admins) see everything.

create type age_group as enum ('U7', 'U9', 'U11', 'U13', 'U15');
create type session_kind as enum ('training', 'match', 'tournament');
create type availability_answer as enum ('coming', 'away');
create type staff_role as enum ('admin', 'coach');
create type chase_channel as enum ('app', 'whatsapp', 'sms', 'gate');
create type payment_state as enum ('active', 'missing', 'overdue', 'self_reported');

-- People ---------------------------------------------------------------------

create table guardians (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  language text not null default 'en' check (language in ('en', 'ur', 'ar', 'bn', 'so')),
  created_at timestamptz not null default now()
);

create table staff (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role staff_role not null
);

create table players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  shirt_number int check (shirt_number between 1 and 99),
  age_group age_group not null,
  position text,
  joined_on date not null default current_date,
  photo_consent boolean,
  photo_consent_recorded_at timestamptz,
  created_at timestamptz not null default now()
);

create table player_guardians (
  player_id uuid not null references players (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  relationship text,
  primary key (player_id, guardian_id)
);

create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  name text not null,
  phone text not null,
  relationship text
);

-- Sessions, availability and attendance --------------------------------------

create table sessions (
  id uuid primary key default gen_random_uuid(),
  kind session_kind not null default 'training',
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text not null,
  age_groups age_group[] not null,
  arrive_by text,
  kit text,
  prayer_note text,
  cancelled_at timestamptz,
  check (ends_at > starts_at)
);

create table availability (
  session_id uuid not null references sessions (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  answer availability_answer not null,
  answered_by uuid references guardians (id) on delete set null,
  answered_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create table attendance (
  session_id uuid not null references sessions (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method text not null default 'qr' check (method in ('qr', 'manual')),
  recorded_by uuid references auth.users (id) on delete set null,
  primary key (session_id, player_id)
);

-- Announcements and the read-chasing ladder ----------------------------------

create table announcements (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  title text not null,
  body text not null,
  audience age_group[], -- null means every age group
  requires_ack boolean not null default true,
  voice_note_path text,
  voice_note_seconds int,
  posted_by uuid references auth.users (id) on delete set null,
  posted_at timestamptz not null default now()
);

create table announcement_reads (
  announcement_id uuid not null references announcements (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, guardian_id)
);

create table announcement_chases (
  id bigint generated always as identity primary key,
  announcement_id uuid not null references announcements (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  channel chase_channel not null,
  sent_at timestamptz not null default now()
);

-- Payments (synced from TeamFeePay), badges and coach notes ------------------

create table payment_status (
  player_id uuid primary key references players (id) on delete cascade,
  provider text not null default 'teamfeepay',
  state payment_state not null default 'missing',
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table badges (
  id text primary key,
  name text not null,
  icon text not null
);

create table player_badges (
  player_id uuid not null references players (id) on delete cascade,
  badge_id text not null references badges (id) on delete cascade,
  earned_on date not null default current_date,
  primary key (player_id, badge_id)
);

create table coach_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  author uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index on availability (player_id);
create index on attendance (player_id);
create index on announcement_reads (guardian_id);
create index on player_guardians (guardian_id);

-- Helper functions used by the policies --------------------------------------

create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where auth_user_id = auth.uid());
$$;

create function my_guardian_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from guardians where auth_user_id = auth.uid();
$$;

create function my_player_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select pg.player_id from player_guardians pg
  join guardians g on g.id = pg.guardian_id
  where g.auth_user_id = auth.uid();
$$;

create function my_age_groups() returns age_group[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p.age_group), '{}') from players p
  where p.id in (select my_player_ids());
$$;

-- Row level security ---------------------------------------------------------

alter table guardians enable row level security;
alter table staff enable row level security;
alter table players enable row level security;
alter table player_guardians enable row level security;
alter table emergency_contacts enable row level security;
alter table sessions enable row level security;
alter table availability enable row level security;
alter table attendance enable row level security;
alter table announcements enable row level security;
alter table announcement_reads enable row level security;
alter table announcement_chases enable row level security;
alter table payment_status enable row level security;
alter table badges enable row level security;
alter table player_badges enable row level security;
alter table coach_notes enable row level security;

create policy "guardian reads own record" on guardians for select using (auth_user_id = auth.uid() or is_staff());
create policy "guardian updates own record" on guardians for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "staff manage guardians" on guardians for all using (is_staff()) with check (is_staff());

create policy "staff read staff" on staff for select using (auth_user_id = auth.uid() or is_staff());

create policy "family reads own players" on players for select using (id in (select my_player_ids()) or is_staff());
create policy "staff manage players" on players for all using (is_staff()) with check (is_staff());

create policy "family reads own links" on player_guardians for select using (guardian_id = my_guardian_id() or is_staff());
create policy "staff manage links" on player_guardians for all using (is_staff()) with check (is_staff());

create policy "family manages emergency contacts" on emergency_contacts for all
  using (player_id in (select my_player_ids()) or is_staff())
  with check (player_id in (select my_player_ids()) or is_staff());

create policy "family reads own sessions" on sessions for select using (is_staff() or age_groups && my_age_groups());
create policy "staff manage sessions" on sessions for all using (is_staff()) with check (is_staff());

create policy "family answers availability" on availability for all
  using (player_id in (select my_player_ids()) or is_staff())
  with check (player_id in (select my_player_ids()) or is_staff());

create policy "family reads attendance" on attendance for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff record attendance" on attendance for all using (is_staff()) with check (is_staff());

create policy "family reads announcements" on announcements for select
  using (is_staff() or audience is null or audience && my_age_groups());
create policy "staff manage announcements" on announcements for all using (is_staff()) with check (is_staff());

create policy "guardian acknowledges" on announcement_reads for insert with check (guardian_id = my_guardian_id());
create policy "guardian and staff read acknowledgements" on announcement_reads for select using (guardian_id = my_guardian_id() or is_staff());

create policy "staff manage chases" on announcement_chases for all using (is_staff()) with check (is_staff());

create policy "family reads payment status" on payment_status for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff manage payment status" on payment_status for all using (is_staff()) with check (is_staff());

create policy "everyone signed in reads badges" on badges for select using (auth.uid() is not null);
create policy "staff manage badges" on badges for all using (is_staff()) with check (is_staff());

create policy "family reads own badges" on player_badges for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff award badges" on player_badges for all using (is_staff()) with check (is_staff());

create policy "family reads coach notes" on coach_notes for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff write coach notes" on coach_notes for all using (is_staff()) with check (is_staff());

-- Admin dashboard: one row per player showing what is still missing --------

create view family_gaps with (security_invoker = true) as
select
  p.id as player_id,
  p.first_name,
  p.last_name,
  p.age_group,
  coalesce(ps.state, 'missing') as payment,
  exists (
    select 1 from player_guardians pg join guardians g on g.id = pg.guardian_id
    where pg.player_id = p.id and g.auth_user_id is not null
  ) as in_app,
  p.photo_consent is not null as consent_recorded,
  (select count(*) from emergency_contacts ec where ec.player_id = p.id) as emergency_contacts
from players p
left join payment_status ps on ps.player_id = p.id;
