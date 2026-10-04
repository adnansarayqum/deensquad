-- Deen Squad: the club's data for the parent app, coach register and admin.
-- Row level security: a parent sees only their own children (any number of them, each of
-- whom can have more than one parent); staff (coaches, admins) see the whole club.

create type age_group as enum ('U7', 'U9', 'U11', 'U13', 'U15');
create type session_kind as enum ('training', 'match', 'tournament');
create type availability_answer as enum ('coming', 'away');
create type staff_role as enum ('admin', 'coach');
create type chase_channel as enum ('app', 'whatsapp', 'sms', 'gate');
create type payment_state as enum ('active', 'missing', 'overdue', 'self_reported');

-- People ---------------------------------------------------------------------

-- A parent or carer. Signs in with `email`; auth_user_id is filled in on first sign-in.
create table guardians (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  language text not null default 'en' check (language in ('en', 'ur', 'ar', 'bn', 'so')),
  invited_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index guardians_email_key on guardians (lower(email)) where email is not null;

-- Coaches and admins. Added by email; linked to a sign-in the first time they sign in.
create table staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  email text not null,
  display_name text not null,
  role staff_role not null,
  created_at timestamptz not null default now()
);
create unique index staff_email_key on staff (lower(email));

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
create index players_age_group_idx on players (age_group);

-- Many-to-many: one parent can have several children at the club, and a child can have two parents.
create table player_guardians (
  player_id uuid not null references players (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  relationship text,
  primary key (player_id, guardian_id)
);
create index player_guardians_guardian_idx on player_guardians (guardian_id);

create table emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  name text not null,
  phone text not null,
  relationship text,
  created_at timestamptz not null default now()
);
create index emergency_contacts_player_idx on emergency_contacts (player_id);

-- Sessions, availability and attendance --------------------------------------

create table sessions (
  id uuid primary key default gen_random_uuid(),
  kind session_kind not null default 'training',
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text not null,
  age_groups age_group[] not null check (cardinality(age_groups) > 0),
  arrive_by text,
  kit text,
  prayer_note text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index sessions_starts_idx on sessions (starts_at);

create table availability (
  session_id uuid not null references sessions (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  answer availability_answer not null,
  answered_by uuid references guardians (id) on delete set null,
  answered_at timestamptz not null default now(),
  primary key (session_id, player_id)
);
create index availability_player_idx on availability (player_id);

create table attendance (
  session_id uuid not null references sessions (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method text not null default 'manual' check (method in ('qr', 'manual')),
  recorded_by uuid references auth.users (id) on delete set null,
  primary key (session_id, player_id)
);
create index attendance_player_idx on attendance (player_id);

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
  posted_by uuid references staff (id) on delete set null,
  posted_at timestamptz not null default now()
);
create index announcements_posted_idx on announcements (posted_at desc);

create table announcement_reads (
  announcement_id uuid not null references announcements (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, guardian_id)
);
create index announcement_reads_guardian_idx on announcement_reads (guardian_id);

create table announcement_chases (
  id bigint generated always as identity primary key,
  announcement_id uuid not null references announcements (id) on delete cascade,
  guardian_id uuid not null references guardians (id) on delete cascade,
  channel chase_channel not null,
  sent_at timestamptz not null default now()
);

-- Payments (TeamFeePay), badges and coach notes --------------------------------

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
  icon text not null check (icon in ('star', 'clock', 'trophy', 'flame', 'target'))
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
  author uuid references staff (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index coach_notes_player_idx on coach_notes (player_id, created_at desc);

-- Helper functions used by the policies --------------------------------------

create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where auth_user_id = auth.uid());
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where auth_user_id = auth.uid() and role = 'admin');
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

-- Parents can't read other families' answers, so the squad headcount comes from here as numbers only.
create function squad_counts(p_session uuid, p_age age_group)
returns table (coming int, away int, squad int)
language sql stable security definer set search_path = public as $$
  select
    (count(*) filter (where a.answer = 'coming'))::int,
    (count(*) filter (where a.answer = 'away'))::int,
    count(*)::int
  from players p
  left join availability a on a.player_id = p.id and a.session_id = p_session
  where p.age_group = p_age
    and (is_staff() or p_age = any (my_age_groups()))
    and exists (select 1 from sessions s where s.id = p_session and p_age = any (s.age_groups));
$$;

-- Parents may change exactly these fields on their own child, nothing else on the player.
create function set_photo_consent(p_player uuid, p_consent boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (p_player in (select my_player_ids()) or is_staff()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update players set photo_consent = p_consent, photo_consent_recorded_at = now() where id = p_player;
end
$$;

-- A parent says they've set up the monthly plan. The club confirms it against TeamFeePay.
create function report_payment_setup(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (p_player in (select my_player_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into payment_status (player_id, state) values (p_player, 'self_reported')
  on conflict (player_id) do update set state = 'self_reported', updated_at = now()
  where payment_status.state <> 'active';
end
$$;

revoke execute on function squad_counts(uuid, age_group), set_photo_consent(uuid, boolean), report_payment_setup(uuid) from public;
grant execute on function
  is_staff(), is_admin(), my_guardian_id(), my_player_ids(), my_age_groups(),
  squad_counts(uuid, age_group), set_photo_consent(uuid, boolean), report_payment_setup(uuid)
to authenticated;

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

-- A parent sees themselves and the other parent of their children (to show "Mum has read this" later).
create policy "family reads guardians" on guardians for select using (
  auth_user_id = auth.uid()
  or id in (select guardian_id from player_guardians where player_id in (select my_player_ids()))
  or is_staff()
);
create policy "staff manage guardians" on guardians for all using (is_staff()) with check (is_staff());

create policy "staff read staff" on staff for select using (auth_user_id = auth.uid() or is_staff());
create policy "admins manage staff" on staff for all using (is_admin()) with check (is_admin());

create policy "family reads own players" on players for select using (id in (select my_player_ids()) or is_staff());
create policy "staff manage players" on players for all using (is_staff()) with check (is_staff());

create policy "family reads own links" on player_guardians for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff manage links" on player_guardians for all using (is_staff()) with check (is_staff());

create policy "family manages emergency contacts" on emergency_contacts for all
  using (player_id in (select my_player_ids()) or is_staff())
  with check (player_id in (select my_player_ids()) or is_staff());

create policy "family reads own sessions" on sessions for select using (is_staff() or age_groups && my_age_groups());
create policy "staff manage sessions" on sessions for all using (is_staff()) with check (is_staff());

-- The session must also be one this parent can see (the subquery runs under the sessions policy).
create policy "family answers availability" on availability for all
  using (player_id in (select my_player_ids()) or is_staff())
  with check (
    (player_id in (select my_player_ids()) and exists (select 1 from sessions s where s.id = session_id))
    or is_staff()
  );

create policy "family reads attendance" on attendance for select using (player_id in (select my_player_ids()) or is_staff());
create policy "staff record attendance" on attendance for all using (is_staff()) with check (is_staff());

create policy "family reads announcements" on announcements for select
  using (is_staff() or audience is null or audience && my_age_groups());
create policy "staff manage announcements" on announcements for all using (is_staff()) with check (is_staff());

create policy "guardian acknowledges" on announcement_reads for insert with check (
  guardian_id = my_guardian_id() and exists (select 1 from announcements a where a.id = announcement_id)
);
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

-- Admin: one row per player showing what is still missing --------------------

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
  (select count(*) from emergency_contacts ec where ec.player_id = p.id)::int as emergency_contacts
from players p
left join payment_status ps on ps.player_id = p.id;

-- Names only, so a parent can see who posted a message without seeing staff email addresses.
-- (A plain view runs as its owner, so it can read staff even though parents can't.)
create view staff_names as select id, display_name from staff;

-- Table access for signed-in requests. Row level security above decides which rows.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  guardians, staff, players, player_guardians, emergency_contacts, sessions, availability, attendance,
  announcements, announcement_reads, announcement_chases, payment_status, badges, player_badges, coach_notes
to authenticated;
grant usage, select on sequence announcement_chases_id_seq to authenticated;
grant select on family_gaps, staff_names to authenticated;
