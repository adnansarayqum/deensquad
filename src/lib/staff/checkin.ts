import { londonDate, londonTime, sameLondonDay, shortDay } from "../dates";
import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import type { AgeGroup, PaymentState } from "../domain";
import { readPass } from "../pass/token";
import { sessionIsFor } from "../squads/sql";
import { unreadNewsSql, type RegisterFlag } from "./register";

// Checking a child in from their gate pass. Runs as the member of staff scanning (row level security on).
// The child goes into today's session for their age group, or a tournament squad session they're picked for
// (never a squad session they aren't in).

export type ScannedChild = {
  id: string;
  firstName: string;
  lastInitial: string;
  shirtNumber: number | null;
  /** The photo a parent added for the coaches (a club_files id). */
  photoId: string | null;
  ageGroup: AgeGroup;
  status: "checked_in" | "already_here" | "no_session_today";
  session: { title: string; startsAt: string } | null;
  flags: RegisterFlag[];
};

export type ScanResult = { ok: true; child: ScannedChild } | { ok: false; reason: "not_a_pass" | "unknown_child" };

export async function checkInByPass(tx: Queryable, token: unknown, now: Date): Promise<ScanResult> {
  const playerId = readPass(token);
  if (!playerId) return { ok: false, reason: "not_a_pass" };

  const [c] = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    shirt_number: number | null;
    age_group: AgeGroup;
    photo_consent: boolean | null;
    photo_file_id: string | null;
    payment: PaymentState;
    unread_news: boolean;
    kit_ready: boolean;
  }>(
    `select p.id, p.first_name, p.last_name, p.shirt_number, p.age_group::text as age_group, p.photo_consent, p.photo_file_id,
       coalesce(ps.state, 'missing')::text as payment,
       ${unreadNewsSql("$2")} as unread_news,
       exists (
         select 1 from shop_order_items i join shop_orders o on o.id = i.order_id where i.player_id = p.id and o.status = 'ready'
       ) as kit_ready
     from players p left join payment_status ps on ps.player_id = p.id where p.id = $1`,
    [playerId, now],
  );
  if (!c) return { ok: false, reason: "unknown_child" };

  const d = londonDate(now);
  const options = await tx.query<{ id: string; title: string; starts_at: Date; ends_at: Date }>(
    `select s.id, s.title, s.starts_at, s.ends_at from sessions s, players p
     where p.id = $3 and s.starts_at between $1 and $2 and s.cancelled_at is null and ${sessionIsFor("s", "p")}
     order by s.starts_at, s.id`,
    [londonTime(d.year, d.month, d.day, 0, 0), londonTime(d.year, d.month, d.day, 23, 59), c.id],
  );
  // The session that's on now, or else the nearest one today. Ties (overlapping sessions) go to the earliest start,
  // then id, as the register picks by default: the sort is stable over the query's order.
  const session = options.sort((a, b) => distance(a, now) - distance(b, now))[0];

  let status: ScannedChild["status"] = "no_session_today";
  if (session) {
    const inserted = await tx.query(
      `insert into attendance (session_id, player_id, method, recorded_by) values ($1, $2, 'qr', auth.uid())
       on conflict do nothing returning player_id`,
      [session.id, c.id],
    );
    status = inserted.length ? "checked_in" : "already_here";
  }
  return {
    ok: true,
    child: {
      id: c.id,
      firstName: c.first_name,
      lastInitial: c.last_name[0] ?? "",
      shirtNumber: c.shirt_number,
      photoId: c.photo_file_id,
      ageGroup: c.age_group,
      status,
      session: session ? { title: session.title, startsAt: iso(session.starts_at) } : null,
      flags: [
        ...(c.payment === "missing" || c.payment === "overdue" ? (["no_payment_plan"] as const) : []),
        ...(c.photo_consent === null ? (["missing_consent"] as const) : []),
        ...(c.unread_news ? (["unread_news"] as const) : []),
        ...(c.kit_ready ? (["kit_ready"] as const) : []),
      ],
    },
  };
}

/** Zero while a session is on; otherwise how far its start or finish is from now. */
function distance(s: { starts_at: Date; ends_at: Date }, now: Date): number {
  const start = new Date(s.starts_at).getTime();
  const end = new Date(s.ends_at).getTime();
  const t = now.getTime();
  return t >= start && t <= end ? 0 : Math.min(Math.abs(start - t), Math.abs(end - t));
}

/**
 * Attendance is recorded only on the session's own day (London time), so a practice tap on a Tuesday can't
 * check a child into Friday's session. The register shows the next session read-only until then.
 */
export function registerOpen(startsAt: string, now: Date): boolean {
  return sameLondonDay(new Date(startsAt), now);
}

/** Why Mark here is off for a session that isn't today. */
export function registerClosedMessage(startsAt: string, now: Date): string {
  return new Date(startsAt).getTime() > now.getTime()
    ? `Opens on ${shortDay(startsAt)}. You can mark children here on the day.`
    : `This session was on ${shortDay(startsAt)}. Children can only be marked here on the day.`;
}

/** Why a session's register can't be changed at `now` (gone, or not its day), or null when it's open. */
async function registerRefusal(tx: Queryable, sessionId: string, now: Date): Promise<string | null> {
  const [s] = await tx.query<{ starts_at: Date; cancelled: boolean }>(
    `select starts_at, cancelled_at is not null as cancelled from sessions where id = $1`,
    [sessionId],
  );
  if (!s) return "That session isn't on the register any more. Reload the page.";
  if (s.cancelled) return "This session was cancelled. Nothing was saved.";
  const startsAt = iso(s.starts_at);
  return registerOpen(startsAt, now) ? null : registerClosedMessage(startsAt, now);
}

/** A coach's Mark here: checks the child into that session, only on the session's day. Runs as staff (row level security on). */
export async function markHere(tx: Queryable, sessionId: string, playerId: string, now: Date): Promise<{ error?: string }> {
  const refused = await registerRefusal(tx, sessionId, now);
  if (refused) return { error: refused };
  await tx.query(
    `insert into attendance (session_id, player_id, method, recorded_by) values ($1, $2, 'manual', auth.uid()) on conflict do nothing`,
    [sessionId, playerId],
  );
  return {};
}

/** Undo a check-in (Mark here or a scanned QR code): the same day lock as Mark here, so attendance on other days stays as it is. */
export async function undoHere(tx: Queryable, sessionId: string, playerId: string, now: Date): Promise<{ error?: string }> {
  const refused = await registerRefusal(tx, sessionId, now);
  if (refused) return { error: refused };
  await tx.query(`delete from attendance where session_id = $1 and player_id = $2`, [sessionId, playerId]);
  return {};
}
