-- Three things the club owner asked for (Oct 2026). Forward-only and additive.
--
-- 1. Gate payments: pay-as-you-go families (and trial children) pay the session fee (£7, by card on the club's
--    machine) at the gate; a coach taps "Paid £7" and it's recorded here, one row per session and child (or trial).
-- 2. Accidents and incidents: a coach logs what happened and what was done; the parents are told automatically (a
--    message in the app, src/lib/incidents) and the admins emailed. Kept as a club record: nobody edits or deletes.
-- 3. Paid trial sessions: a family not yet in the club books one trial session on the public /trial page (no sign-in);
--    the coaches see the child on the register, mark them arrived and take the fee; after it they're emailed a link
--    to join. Only staff can read bookings; the public page writes through the server (asSystem), never a grant.

-- Trial bookings first: payments refer to them.
create table trial_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  parent_first_name text not null check (char_length(parent_first_name) between 1 and 60),
  parent_last_name text not null check (char_length(parent_last_name) between 1 and 60),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) between 5 and 30),
  child_first_name text not null check (char_length(child_first_name) between 1 and 60),
  child_last_name text not null check (char_length(child_last_name) between 1 and 60),
  date_of_birth date not null,
  age_group age_group not null,
  created_at timestamptz not null default now(),
  arrived_at timestamptz,
  cancelled_at timestamptz,
  follow_up_sent_at timestamptz
);
create index trial_bookings_session_idx on trial_bookings (session_id);
-- One trial per child: the same parent email, child first name and date of birth can't book again (unless cancelled).
create unique index trial_bookings_once on trial_bookings (lower(email), lower(child_first_name), date_of_birth) where cancelled_at is null;
alter table trial_bookings enable row level security;
create policy "staff manage trial bookings" on trial_bookings for all using (is_staff()) with check (is_staff());
grant select, update on trial_bookings to authenticated;

create table session_payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  player_id uuid references players (id) on delete cascade,
  trial_id uuid references trial_bookings (id) on delete cascade,
  amount_pence integer not null check (amount_pence between 1 and 100000),
  method text not null default 'card' check (method in ('card', 'cash')),
  taken_by uuid references staff (id) on delete set null,
  taken_at timestamptz not null default now(),
  check ((player_id is null) <> (trial_id is null))
);
create unique index session_payments_player_once on session_payments (session_id, player_id) where player_id is not null;
create unique index session_payments_trial_once on session_payments (session_id, trial_id) where trial_id is not null;
create index session_payments_taken_idx on session_payments (taken_at desc);
alter table session_payments enable row level security;
create policy "staff manage gate payments" on session_payments for all using (is_staff()) with check (is_staff());
create policy "family reads own gate payments" on session_payments for select using (player_id in (select my_player_ids()));
grant select, insert, delete on session_payments to authenticated;

create table incidents (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  session_id uuid references sessions (id) on delete set null,
  kind text not null check (kind in ('injury', 'illness', 'behaviour', 'other')),
  happened_at timestamptz not null,
  what_happened text not null check (char_length(what_happened) between 1 and 2000),
  action_taken text not null check (char_length(action_taken) between 1 and 2000),
  reported_by uuid references staff (id) on delete set null,
  reported_by_name text not null check (char_length(reported_by_name) between 1 and 120),
  conversation_id uuid references conversations (id) on delete set null,
  created_at timestamptz not null default now()
);
create index incidents_player_idx on incidents (player_id, happened_at desc);
alter table incidents enable row level security;
-- Staff read and write every record (coach scope is in the app, as for awards); parents read their own children's.
create policy "staff manage incidents" on incidents for select using (is_staff());
create policy "staff log incidents" on incidents for insert with check (is_staff());
create policy "family reads own incidents" on incidents for select using (player_id in (select my_player_ids()));
-- Records: no update or delete grant for anyone.
grant select, insert on incidents to authenticated;
