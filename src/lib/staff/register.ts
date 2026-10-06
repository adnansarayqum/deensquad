import { londonDate, londonTime } from "../dates";
import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { isAgeGroup, type AgeGroup, type Availability, type PaymentState, type Session } from "../domain";
import { SESSION_COLUMNS, toSession, type SessionRow } from "../parent/data";
import { newsReaches } from "../squads/sql";
import type { RegisterFlag } from "./flags";

export type { RegisterFlag } from "./flags";

// The coach's gate register for one session and one age group, or for all of the session's groups the coach
// can see at once ("all"). Runs as staff (row level security on).

/** The register's "All groups" tab. */
export const ALL_GROUPS = "all";

export type RegisterRow = {
  id: string;
  firstName: string;
  lastInitial: string;
  ageGroup: AgeGroup;
  shirtNumber: number | null;
  answer: Availability | null;
  checkedInAt: string | null;
  /** How they were checked in: their gate pass or a coach's Mark here. */
  method: "qr" | "manual" | null;
  flags: RegisterFlag[];
};

export type RegisterView = {
  session: Session;
  todays: Session[];
  /** The group shown, or "all" for every group in `groups` together. */
  group: AgeGroup | typeof ALL_GROUPS;
  /** The session's groups (that the coach can see) with children in them; "All groups" is offered when there are two or more. */
  groups: AgeGroup[];
  rows: RegisterRow[];
};

/** Today's sessions (London time), or the next one if there's nothing today. */
export async function loadRegisterSessions(tx: Queryable, now: Date): Promise<Session[]> {
  const d = londonDate(now);
  const start = londonTime(d.year, d.month, d.day, 0, 0);
  const end = londonTime(d.year, d.month, d.day, 23, 59);
  const today = await tx.query<SessionRow>(
    `select ${SESSION_COLUMNS} from sessions s where s.starts_at between $1 and $2 and s.cancelled_at is null order by s.starts_at`,
    [start, end],
  );
  if (today.length) return today.map(toSession);
  const next = await tx.query<SessionRow>(
    `select ${SESSION_COLUMNS} from sessions s where s.ends_at > $1 and s.cancelled_at is null order by s.starts_at limit 1`,
    [now],
  );
  return next.map(toSession);
}

/** `allowed` limits a coach to their own age groups (sessions and squads outside them are left out). */
export async function loadRegister(
  tx: Queryable,
  opts: { now: Date; sessionId?: unknown; group?: unknown; allowed?: AgeGroup[] },
): Promise<RegisterView | null> {
  const allowed = opts.allowed;
  const mine = (s: Session): Session => (allowed ? { ...s, ageGroups: s.ageGroups.filter((g) => allowed.includes(g)) } : s);
  const todays = (await loadRegisterSessions(tx, opts.now)).map(mine).filter((s) => s.ageGroups.length > 0);
  // A linked session (e.g. from the admin dashboard) wins, even on a day with its own sessions; otherwise today's first.
  let session: Session | undefined = todays.find((s) => s.id === opts.sessionId);
  if (!session && typeof opts.sessionId === "string") {
    const [row] = await tx.query<SessionRow>(`select ${SESSION_COLUMNS} from sessions s where s.id::text = $1`, [opts.sessionId]);
    const linked = row ? mine(toSession(row)) : undefined;
    if (linked && linked.ageGroups.length > 0) session = linked;
  }
  session ??= todays[0];
  if (!session || session.ageGroups.length === 0) return null;

  // For a tournament squad session, only the squad counts (and is listed below).
  const counts = await tx.query<{ age_group: AgeGroup; n: number }>(
    `select p.age_group::text as age_group, count(*)::int as n from players p, sessions s
     where s.id = $2 and p.age_group = any($1::text[]::age_group[]) and squad_allows(s.id, p.id) group by p.age_group`,
    [session.ageGroups, session.id],
  );
  const groups = session.ageGroups.filter((g) => counts.some((c) => c.age_group === g && c.n > 0));
  const one = isAgeGroup(opts.group) && session.ageGroups.includes(opts.group) ? opts.group : (groups[0] ?? session.ageGroups[0]);
  const group = opts.group === ALL_GROUPS && groups.length > 1 ? ALL_GROUPS : one;
  const listed = group === ALL_GROUPS ? groups : [group];

  const rows = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    shirt_number: number | null;
    photo_consent: boolean | null;
    payment: PaymentState;
    answer: Availability | null;
    checked_in_at: Date | null;
    method: "qr" | "manual" | null;
    unread_news: boolean;
    kit_ready: boolean;
  }>(
    `select p.id, p.first_name, p.last_name, p.age_group::text as age_group, p.shirt_number, p.photo_consent,
       coalesce(ps.state, 'missing')::text as payment, a.answer::text as answer, at.checked_in_at, at.method,
       -- last rung of the chase ladder: nobody in the family has read a message that's been waiting two days or more
       exists (
         select 1 from announcements an
         where an.requires_ack and an.posted_at <= $3::timestamptz - interval '48 hours' and an.posted_at > $3::timestamptz - interval '14 days'
           and ${newsReaches("an", "p")}
           -- not about a message posted before any of the child's parents were added (see the chase ladder)
           and exists (
             select 1 from player_guardians fg join guardians fgg on fgg.id = fg.guardian_id
             where fg.player_id = p.id and fgg.created_at <= an.posted_at
           )
           and not exists (
             select 1 from announcement_reads r join player_guardians rg on rg.guardian_id = r.guardian_id
             where r.announcement_id = an.id and rg.player_id = p.id
           )
       ) as unread_news,
       exists (
         select 1 from shop_order_items i join shop_orders o on o.id = i.order_id where i.player_id = p.id and o.status = 'ready'
       ) as kit_ready
     from players p
     left join payment_status ps on ps.player_id = p.id
     left join availability a on a.player_id = p.id and a.session_id = $1
     left join attendance at on at.player_id = p.id and at.session_id = $1
     where p.age_group = any ($2::text[]::age_group[]) and squad_allows($1, p.id)
     order by p.first_name, p.last_name`,
    [session.id, listed, opts.now],
  );

  return {
    session,
    todays,
    group,
    groups: groups.length ? groups : [one],
    rows: rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastInitial: r.last_name[0] ?? "",
      ageGroup: r.age_group,
      shirtNumber: r.shirt_number,
      answer: r.answer,
      checkedInAt: r.checked_in_at ? iso(r.checked_in_at) : null,
      method: r.checked_in_at ? r.method : null,
      flags: [
        ...(r.payment === "missing" || r.payment === "overdue" ? (["no_payment_plan"] as const) : []),
        ...(r.photo_consent === null ? (["missing_consent"] as const) : []),
        ...(r.unread_news ? (["unread_news"] as const) : []),
        ...(r.kit_ready ? (["kit_ready"] as const) : []),
      ],
    })),
  };
}

/**
 * Splits the squad for the gate. A child whose parent said not coming is still listed (in `away`), so a coach
 * can mark them in if they turn up; once checked in they count as here and as expected.
 */
export function summarise(view: RegisterView) {
  const here = view.rows.filter((r) => r.checkedInAt).sort((a, b) => b.checkedInAt!.localeCompare(a.checkedInAt!));
  const away = view.rows.filter((r) => !r.checkedInAt && r.answer === "away");
  const notHere = view.rows.filter((r) => !r.checkedInAt && r.answer !== "away");
  return {
    here,
    /** The last one in, at the top with its Undo (one card, so the list still to arrive stays on the first screen). */
    latest: here.slice(0, 1),
    flagged: here.filter((r) => r.flags.length > 0),
    notHere,
    away,
    expectedTotal: view.rows.length - away.length,
  };
}
