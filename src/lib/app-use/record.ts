import "server-only";
import type { Queryable } from "../db/types";

// What the app writes when a parent opens it, sees a post or marks one read from a notification (migration 0055).
// The routes check the sign-in; these take the transaction they're given.

const LONDON_TODAY = `(now() at time zone 'Europe/London')::date`;

/** Longest single stretch counted towards the club's time-in-app total: a phone left open on the app isn't a visit. */
export const MAX_VISIT_SECONDS = 30 * 60;

/** Most posts marked seen in one go (a long News screen). */
export const SEEN_MAX = 50;

/**
 * A parent opened the app (or came back to it): one row per day, counted. Run as the system. `countVisit` is false
 * for staff who are also parents: their open counts, but their time on screen is left out of the club's total, so
 * their visit must be too, or the average visit comes out too short.
 */
export async function recordOpen(tx: Queryable, guardianId: string, countVisit = true): Promise<void> {
  await tx.query(
    `insert into app_opens (guardian_id, day) values ($1, ${LONDON_TODAY})
     on conflict (guardian_id, day) do update set opens = app_opens.opens + 1, last_at = now()`,
    [guardianId],
  );
  if (!countVisit) return;
  await tx.query(`insert into app_use_daily (day, visits) values (${LONDON_TODAY}, 1) on conflict (day) do update set visits = app_use_daily.visits + 1`);
}

/** Seconds the app was on screen, added to the club's day total only (no one's name). Run as the system. */
export async function recordTimeOnScreen(tx: Queryable, seconds: number): Promise<void> {
  const s = Math.round(Math.min(Math.max(seconds, 0), MAX_VISIT_SECONDS));
  if (!s) return;
  await tx.query(`insert into app_use_daily (day, seconds) values (${LONDON_TODAY}, $1) on conflict (day) do update set seconds = app_use_daily.seconds + $1`, [s]);
}

/**
 * Posts that appeared on this parent's screen. Run as the parent: row level security lets them mark only posts they
 * can read, and only as themselves. Returns how many were new.
 */
export async function markSeen(tx: Queryable, ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await tx.query(
    `insert into announcement_views (announcement_id, guardian_id)
     select a.id, my_guardian_id() from announcements a where a.id = any ($1::uuid[]) and my_guardian_id() is not null
     on conflict do nothing returning announcement_id`,
    [ids.slice(0, SEEN_MAX)],
  );
  return rows.length;
}

/**
 * "Mark as read" on a notification. Run as the parent, like the button in the app; only a post that asks for a plain
 * tap (no quick answer, not a "who's coming" question, which need an answer, not a tap). Returns whether it's read.
 */
export async function readFromNotification(tx: Queryable, id: string): Promise<boolean> {
  const [post] = await tx.query<{ ok: boolean }>(
    `select (a.quick_answers is null and coalesce(a.session_notice, '') <> 'attendance') as ok from announcements a where a.id = $1`,
    [id],
  );
  if (!post?.ok) return false;
  await tx.query(`insert into announcement_reads (announcement_id, guardian_id, via) values ($1, my_guardian_id(), 'notification') on conflict do nothing`, [id]);
  await tx.query(`insert into announcement_views (announcement_id, guardian_id) values ($1, my_guardian_id()) on conflict do nothing`, [id]);
  return true;
}

/** App opens older than a year go (the privacy notice says so). Run as the system from the hourly job. */
export async function purgeOldAppOpens(tx: Queryable): Promise<number> {
  const rows = await tx.query(`delete from app_opens where day < ${LONDON_TODAY} - 365 returning guardian_id`);
  await tx.query(`delete from app_use_daily where day < ${LONDON_TODAY} - 365`);
  return rows.length;
}
