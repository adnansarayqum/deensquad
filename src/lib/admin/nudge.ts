import type { Queryable } from "../db/types";
import { dueChases, inQuietHours, logChases, type Senders } from "../chase/ladder";
import { pushConfigured, pushToUsers, type PushSend } from "../chase/senders";

/** How long after one "Send a reminder now" before the next (so parents aren't buzzed again and again). */
export const NUDGE_GAP_MINUTES = 60;

export type NudgeResult =
  | { ok: true; reached: number; noDevice: number; emailed: number }
  | { ok: false; reason: "off" | "quiet" | "wait" | "nobody" };

/**
 * "Send a reminder now" (Coach Javed's request): an app notification to the parents who still haven't read a message
 * (and whose child's other parent hasn't either), on top of the automatic ladder. `guardianIds` are the not-read list
 * the member of staff was shown (already scoped to their groups). Runs as the system, because devices belong to their
 * owners under row level security. Logged per parent reached as 'nudge'.
 *
 * Parents the notification didn't reach (notifications off, or not on the app yet) get the ladder's reminder email
 * now instead of at its usual time, when `email` is given (24 Nov 2026, the owner's friend's request). It is the same
 * one email per post per parent: logged as 'email', so the ladder doesn't send it again, and never to someone it has
 * already gone to.
 */
export async function nudgeUnread(
  tx: Queryable,
  opts: { newsId: string; title: string; guardianIds: string[]; now?: Date; send?: PushSend; email?: Senders["email"] },
): Promise<NudgeResult> {
  const now = opts.now ?? new Date();
  const push = pushConfigured() || opts.send !== undefined;
  if (!push && !opts.email) return { ok: false, reason: "off" };
  if (inQuietHours(now)) return { ok: false, reason: "quiet" };
  if (opts.guardianIds.length === 0) return { ok: false, reason: "nobody" };
  // One reminder at a time per message: two coaches pressing together would both pass the hour's check below.
  await tx.query("select pg_advisory_xact_lock(727281, hashtext($1))", [opts.newsId]);
  const [last] = await tx.query<{ at: Date | null }>(
    `select max(sent_at) as at from announcement_chases where announcement_id = $1 and channel::text = 'nudge'`,
    [opts.newsId],
  );
  if (last?.at && now.getTime() - new Date(last.at).getTime() < NUDGE_GAP_MINUTES * 60_000) return { ok: false, reason: "wait" };
  const people = await tx.query<{ id: string; user_id: string | null }>(`select id, auth_user_id as user_id from guardians where id = any($1::uuid[])`, [
    opts.guardianIds,
  ]);
  const users = people.flatMap((p) => (p.user_id ? [p.user_id] : []));
  // A post that asks for a plain tap gets "Mark as read" on the notification (public/sw.js).
  const [post] = await tx.query<{ tap: boolean }>(
    `select (quick_answers is null and coalesce(session_notice, '') <> 'attendance') as tap from announcements where id = $1`,
    [opts.newsId],
  );
  const payload = { title: "Deen Squad: please read", body: opts.title, url: "/news", ...(post?.tap ? { readId: opts.newsId } : {}) };
  const reached = push ? await pushToUsers(tx, users, payload, opts.send) : new Set<string>();
  const hit = people.filter((p) => p.user_id && reached.has(p.user_id));
  for (const p of hit) {
    await tx.query(`insert into announcement_chases (announcement_id, guardian_id, channel, sent_at) values ($1, $2, 'nudge'::text::chase_channel, $3)`, [opts.newsId, p.id, now]);
  }
  let emailed = 0;
  if (opts.email) {
    const got = new Set(hit.map((p) => p.id));
    const asked = new Set(opts.guardianIds);
    const due = (await dueChases(tx, "email", now, opts.newsId, { early: true })).filter((t) => asked.has(t.guardianId) && !got.has(t.guardianId) && t.email);
    if (due.length) {
      const sent = await opts.email(due, tx);
      await logChases(tx, "email", sent);
      emailed = sent.length;
    }
  }
  return { ok: true, reached: hit.length, noDevice: people.length - hit.length, emailed };
}

/** How many of these parents have a phone or browser with notifications on. */
export async function countWithDevices(tx: Queryable, guardianIds: string[]): Promise<number> {
  if (guardianIds.length === 0) return 0;
  const [row] = await tx.query<{ n: number }>(
    `select count(distinct g.id)::int as n from guardians g join push_subscriptions s on s.user_id = g.auth_user_id where g.id = any($1::uuid[])`,
    [guardianIds],
  );
  return row?.n ?? 0;
}

/** When the last reminder was sent by hand, if ever. */
export async function lastNudge(tx: Queryable, newsId: string): Promise<{ at: string; count: number } | null> {
  const [row] = await tx.query<{ at: Date | null; n: number }>(
    `select max(sent_at) as at, count(*)::int as n from announcement_chases
     where announcement_id = $1 and channel::text = 'nudge' and sent_at > (select max(sent_at) - interval '5 minutes' from announcement_chases where announcement_id = $1 and channel::text = 'nudge')`,
    [newsId],
  );
  return row?.at ? { at: new Date(row.at).toISOString(), count: row.n } : null;
}
