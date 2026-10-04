import { londonDate, londonTime } from "../dates";
import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import type { AgeGroup, PaymentState } from "../domain";
import { readPass } from "../pass/token";
import type { RegisterFlag } from "./register";

// Checking a family in from their gate pass. Runs as the member of staff scanning (row level security on).
// Every child of that parent who has a session today is checked in; siblings in different
// age groups go into their own group's session.

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

export type ScanResult =
  | { ok: true; parent: string; children: ScannedChild[] }
  | { ok: false; reason: "not_a_pass" | "unknown_parent" | "no_children" };

export async function checkInByPass(tx: Queryable, token: unknown, now: Date): Promise<ScanResult> {
  const guardianId = readPass(token);
  if (!guardianId) return { ok: false, reason: "not_a_pass" };

  const [parent] = await tx.query<{ first_name: string; last_name: string }>(`select first_name, last_name from guardians where id = $1`, [guardianId]);
  if (!parent) return { ok: false, reason: "unknown_parent" };

  const children = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    shirt_number: number | null;
    age_group: AgeGroup;
    photo_consent: boolean | null;
    payment: PaymentState;
  }>(
    `select p.id, p.first_name, p.last_name, p.shirt_number, p.age_group::text as age_group, p.photo_consent,
       coalesce(ps.state, 'missing')::text as payment
     from players p
     join player_guardians pg on pg.player_id = p.id and pg.guardian_id = $1
     left join payment_status ps on ps.player_id = p.id
     order by p.date_of_birth nulls last, p.first_name`,
    [guardianId],
  );
  if (children.length === 0) return { ok: false, reason: "no_children" };

  const d = londonDate(now);
  const today = await tx.query<{ id: string; title: string; starts_at: Date; ends_at: Date; age_groups: AgeGroup[] }>(
    `select id, title, starts_at, ends_at, age_groups::text[] as age_groups from sessions
     where starts_at between $1 and $2 and cancelled_at is null order by starts_at`,
    [londonTime(d.year, d.month, d.day, 0, 0), londonTime(d.year, d.month, d.day, 23, 59)],
  );

  const result: ScannedChild[] = [];
  for (const c of children) {
    // The session for this child's group that's on now, or else the nearest one today.
    const options = today.filter((s) => s.age_groups.includes(c.age_group));
    const session = options.sort(
      (a, b) => distance(a, now) - distance(b, now),
    )[0];
    let status: ScannedChild["status"] = "no_session_today";
    if (session) {
      const inserted = await tx.query(
        `insert into attendance (session_id, player_id, method, recorded_by) values ($1, $2, 'qr', auth.uid())
         on conflict do nothing returning player_id`,
        [session.id, c.id],
      );
      status = inserted.length ? "checked_in" : "already_here";
    }
    result.push({
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
      ],
    });
  }
  return { ok: true, parent: `${parent.first_name} ${parent.last_name}`, children: result };
}

/** Zero while a session is on; otherwise how far its start or finish is from now. */
function distance(s: { starts_at: Date; ends_at: Date }, now: Date): number {
  const start = new Date(s.starts_at).getTime();
  const end = new Date(s.ends_at).getTime();
  const t = now.getTime();
  return t >= start && t <= end ? 0 : Math.min(Math.abs(start - t), Math.abs(end - t));
}
