import { londonDate, londonTime } from "../dates";
import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import type { AgeGroup, PaymentState } from "../domain";
import { readPass } from "../pass/token";
import type { RegisterFlag } from "./register";

// Checking a child in from their gate pass. Runs as the member of staff scanning (row level security on).
// The child goes into today's session for their age group.

export type ScannedChild = {
  id: string;
  firstName: string;
  lastInitial: string;
  shirtNumber: number | null;
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
    payment: PaymentState;
    kit_ready: boolean;
  }>(
    `select p.id, p.first_name, p.last_name, p.shirt_number, p.age_group::text as age_group, p.photo_consent,
       coalesce(ps.state, 'missing')::text as payment,
       exists (
         select 1 from shop_order_items i join shop_orders o on o.id = i.order_id where i.player_id = p.id and o.status = 'ready'
       ) as kit_ready
     from players p left join payment_status ps on ps.player_id = p.id where p.id = $1`,
    [playerId],
  );
  if (!c) return { ok: false, reason: "unknown_child" };

  const d = londonDate(now);
  const options = await tx.query<{ id: string; title: string; starts_at: Date; ends_at: Date }>(
    `select id, title, starts_at, ends_at from sessions
     where starts_at between $1 and $2 and cancelled_at is null and $3::age_group = any (age_groups)
     order by starts_at, id`,
    [londonTime(d.year, d.month, d.day, 0, 0), londonTime(d.year, d.month, d.day, 23, 59), c.age_group],
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
      ageGroup: c.age_group,
      status,
      session: session ? { title: session.title, startsAt: iso(session.starts_at) } : null,
      flags: [
        ...(c.payment === "missing" || c.payment === "overdue" ? (["no_payment_plan"] as const) : []),
        ...(c.photo_consent === null ? (["missing_consent"] as const) : []),
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
