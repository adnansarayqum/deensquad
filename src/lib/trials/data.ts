import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import type { AgeGroup } from "../domain";
import { registerRefusal } from "../staff/checkin";

// Paid trial sessions (migration 0032 `trial_bookings`; the owner's decision: a trial costs the session fee, paid by
// card at the gate). A family not yet in the club books one trial on the public /trial page; the coaches see the
// child on that session's register (Trials), mark them arrived and take the fee (src/lib/gate). After it, an
// arrived family is emailed a link to join (`dueFollowUps`). One trial per child (email + first name + date of
// birth). Bookings are anonymised 180 days after their session (`anonymiseOldTrials`), keeping only the takings.

/** How far ahead the booking page offers sessions. */
export const TRIAL_DAYS_AHEAD = 28;
/** After this long, a booking's personal details are removed (the privacy notice says so). */
export const TRIAL_KEEP_DAYS = 180;

export type TrialSession = { id: string; title: string; startsAt: string; endsAt: string; venue: string | null; ageGroups: AgeGroup[] };

/** Sessions a family can book a trial for: not cancelled, not a tournament squad (picked children only), in the next 4 weeks. */
export async function loadTrialSessions(tx: Queryable, now: Date): Promise<TrialSession[]> {
  const rows = await tx.query<{ id: string; title: string; starts_at: Date; ends_at: Date; venue: string | null; age_groups: AgeGroup[] }>(
    `select s.id, s.title, s.starts_at, s.ends_at, s.venue, s.age_groups::text[] as age_groups from sessions s
     where s.starts_at > $1 and s.starts_at < $1::timestamptz + make_interval(days => $2) and s.cancelled_at is null
       and not exists (select 1 from session_squads q where q.session_id = s.id)
     order by s.starts_at`,
    [now, TRIAL_DAYS_AHEAD],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, startsAt: iso(r.starts_at), endsAt: iso(r.ends_at), venue: r.venue, ageGroups: r.age_groups }));
}

export type TrialInput = {
  sessionId: string;
  parentFirstName: string;
  parentLastName: string;
  email: string;
  phone: string | null;
  childFirstName: string;
  childLastName: string;
  dateOfBirth: string;
  ageGroup: AgeGroup;
};

export type BookResult = { ok: true; id: string; session: TrialSession } | { ok: false; reason: "session" | "group" | "already" };

/** Books a trial (run with asSystem by the public page's action, which has validated the fields). */
export async function bookTrial(tx: Queryable, input: TrialInput, now: Date): Promise<BookResult> {
  const session = (await loadTrialSessions(tx, now)).find((s) => s.id === input.sessionId);
  if (!session) return { ok: false, reason: "session" };
  if (!session.ageGroups.includes(input.ageGroup)) return { ok: false, reason: "group" };
  const rows = await tx.query<{ id: string }>(
    `insert into trial_bookings (session_id, parent_first_name, parent_last_name, email, phone, child_first_name, child_last_name, date_of_birth, age_group)
     values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::text::age_group)
     on conflict (lower(email), lower(child_first_name), date_of_birth) where cancelled_at is null do nothing returning id`,
    [input.sessionId, input.parentFirstName, input.parentLastName, input.email, input.phone, input.childFirstName, input.childLastName, input.dateOfBirth, input.ageGroup],
  );
  return rows[0] ? { ok: true, id: rows[0].id, session } : { ok: false, reason: "already" };
}

export type TrialRow = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionStartsAt: string;
  childName: string;
  childFirstName: string;
  ageGroup: AgeGroup;
  dateOfBirth: string;
  parentName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  arrivedAt: string | null;
  cancelledAt: string | null;
  paidPence: number | null;
};

const TRIAL_SELECT = `select t.id, t.session_id, s.title, s.starts_at, t.child_first_name, t.child_last_name, t.age_group::text as age_group,
   t.date_of_birth::text as date_of_birth, t.parent_first_name, t.parent_last_name, t.email, t.phone, t.created_at, t.arrived_at, t.cancelled_at,
   (select sp.amount_pence from session_payments sp where sp.trial_id = t.id and sp.session_id = t.session_id) as paid_pence
   from trial_bookings t join sessions s on s.id = t.session_id`;

type TrialDbRow = {
  id: string;
  session_id: string;
  title: string;
  starts_at: Date;
  child_first_name: string;
  child_last_name: string;
  age_group: AgeGroup;
  date_of_birth: string;
  parent_first_name: string;
  parent_last_name: string;
  email: string;
  phone: string | null;
  created_at: Date;
  arrived_at: Date | null;
  cancelled_at: Date | null;
  paid_pence: number | null;
};

const toTrial = (r: TrialDbRow): TrialRow => ({
  id: r.id,
  sessionId: r.session_id,
  sessionTitle: r.title,
  sessionStartsAt: iso(r.starts_at),
  childName: `${r.child_first_name} ${r.child_last_name}`,
  childFirstName: r.child_first_name,
  ageGroup: r.age_group,
  dateOfBirth: r.date_of_birth,
  parentName: `${r.parent_first_name} ${r.parent_last_name}`,
  email: r.email,
  phone: r.phone,
  createdAt: iso(r.created_at),
  arrivedAt: r.arrived_at ? iso(r.arrived_at) : null,
  cancelledAt: r.cancelled_at ? iso(r.cancelled_at) : null,
  paidPence: r.paid_pence,
});

/** A session's trial children for the register (not cancelled), in the groups shown. Staff only (row level security). */
export async function loadSessionTrials(tx: Queryable, sessionId: string, groups: readonly AgeGroup[]): Promise<TrialRow[]> {
  const rows = await tx.query<TrialDbRow>(
    `${TRIAL_SELECT} where t.session_id = $1 and t.cancelled_at is null and t.age_group::text = any ($2::text[]) order by t.child_first_name`,
    [sessionId, [...groups]],
  );
  return rows.map(toTrial);
}

/** Admin → Trials: bookings for sessions from 30 days ago on, in this member of staff's groups (null: every group). */
export async function loadTrials(tx: Queryable, now: Date, mine: readonly AgeGroup[] | null): Promise<TrialRow[]> {
  const rows = await tx.query<TrialDbRow>(
    `${TRIAL_SELECT} where s.starts_at > $1::timestamptz - interval '30 days' and ($2::text[] is null or t.age_group::text = any ($2::text[]))
     order by s.starts_at, t.child_first_name`,
    [now, mine ? [...mine] : null],
  );
  return rows.map(toTrial);
}

/** The coach marks a trial child arrived (or undoes it): only on the session's day, like Mark here. */
export async function setTrialArrived(tx: Queryable, sessionId: string, trialId: string, arrived: boolean, now: Date): Promise<{ error?: string }> {
  const refused = await registerRefusal(tx, sessionId, now);
  if (refused) return { error: refused };
  const rows = await tx.query(
    `update trial_bookings set arrived_at = ${arrived ? "coalesce(arrived_at, now())" : "null"} where id = $1 and session_id = $2 and cancelled_at is null returning id`,
    [trialId, sessionId],
  );
  return rows.length ? {} : { error: "That trial isn't on this register any more. Reload the page." };
}

/** Cancels a booking (staff). Its payment, if any, stays. */
export async function cancelTrial(tx: Queryable, trialId: string, mine: readonly AgeGroup[] | null): Promise<boolean> {
  const rows = await tx.query(
    `update trial_bookings set cancelled_at = now() where id = $1 and cancelled_at is null and ($2::text[] is null or age_group::text = any ($2::text[])) returning id`,
    [trialId, mine ? [...mine] : null],
  );
  return rows.length > 0;
}

/**
 * Families to email after their trial: arrived, session finished at least an hour ago and no more than 7 days ago,
 * not emailed yet. Run with asSystem by the hourly cron.
 */
export async function dueFollowUps(tx: Queryable, now: Date) {
  return tx.query<{ id: string; email: string; parent_first_name: string; child_first_name: string }>(
    `select t.id, t.email, t.parent_first_name, t.child_first_name from trial_bookings t join sessions s on s.id = t.session_id
     where t.arrived_at is not null and t.cancelled_at is null and t.follow_up_sent_at is null
       and s.ends_at < $1::timestamptz - interval '1 hour' and s.ends_at > $1::timestamptz - interval '7 days'
     order by s.ends_at limit 200`,
    [now],
  );
}

export async function markFollowUpSent(tx: Queryable, ids: string[]): Promise<void> {
  if (ids.length) await tx.query(`update trial_bookings set follow_up_sent_at = now() where id = any ($1::uuid[])`, [ids]);
}

/** Removes the personal details of bookings whose session was more than 180 days ago (the takings stay). */
export async function anonymiseOldTrials(tx: Queryable, now: Date): Promise<number> {
  const rows = await tx.query(
    `update trial_bookings t set parent_first_name = 'Removed', parent_last_name = 'Removed', email = 'removed+' || t.id || '@invalid',
       phone = null, child_first_name = 'Trial', child_last_name = 'child', date_of_birth = date_trunc('year', t.date_of_birth)::date
     from sessions s where s.id = t.session_id and s.starts_at < $1::timestamptz - make_interval(days => $2) and t.email not like 'removed+%'
     returning t.id`,
    [now, TRIAL_KEEP_DAYS],
  );
  return rows.length;
}
