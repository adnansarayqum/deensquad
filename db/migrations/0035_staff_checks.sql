-- Staff checks (Oct 2026): DBS, safeguarding, first aid and coaching qualifications for every coach and admin, with
-- the date each runs out, so the club can see who is cleared to coach and is told before anything lapses. Clubs and
-- venues ask for this; the FootballPro comparison showed it as a gap. Forward-only and additive.
--
-- One row per check. Admins add and change them; each member of staff can read their own. The certificate number is
-- optional and short (a reference, not a scan); no documents are stored.

create table staff_checks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id) on delete cascade,
  kind text not null check (kind in ('dbs', 'safeguarding', 'first_aid', 'coaching', 'other')),
  -- What it is when the kind alone doesn't say: "FA Introduction to Coaching Football", "Emergency First Aid in Sport".
  title text check (title is null or char_length(title) between 1 and 80),
  reference text check (reference is null or char_length(reference) between 1 and 40),
  issued_on date,
  expires_on date,
  -- Set when the "runs out soon" email has gone for this expiry date; cleared when the date changes.
  reminded_at timestamptz,
  updated_by uuid references staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on is null or issued_on is null or expires_on > issued_on)
);
create index staff_checks_staff_idx on staff_checks (staff_id);
create index staff_checks_expiry_idx on staff_checks (expires_on) where expires_on is not null;

alter table staff_checks enable row level security;
create policy "admins manage staff checks" on staff_checks for all using (is_admin()) with check (is_admin());
create policy "staff read own checks" on staff_checks for select
  using (staff_id in (select id from staff where auth_user_id = auth.uid()));
grant select, insert, update, delete on staff_checks to authenticated;
