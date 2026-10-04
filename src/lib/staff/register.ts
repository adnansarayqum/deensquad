import { londonDate, londonTime } from "../dates";
import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { isAgeGroup, type AgeGroup, type Availability, type PaymentState, type Session } from "../domain";
import { SESSION_COLUMNS, toSession, type SessionRow } from "../parent/data";

// The coach's gate register for one session and one age group. Runs as staff (row level security on).

export type RegisterFlag = "no_payment_plan" | "missing_consent";

export type RegisterRow = {
  id: string;
  firstName: string;
  lastInitial: string;
  shirtNumber: number | null;
  answer: Availability | null;
  checkedInAt: string | null;
  flags: RegisterFlag[];
};

export type RegisterView = {
  session: Session;
  todays: Session[];
  group: AgeGroup;
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

export async function loadRegister(tx: Queryable, opts: { now: Date; sessionId?: unknown; group?: unknown }): Promise<RegisterView | null> {
  const todays = await loadRegisterSessions(tx, opts.now);
  let session: Session | undefined = todays.find((s) => s.id === opts.sessionId) ?? todays[0];
  if (!session && typeof opts.sessionId === "string") {
    const [row] = await tx.query<SessionRow>(`select ${SESSION_COLUMNS} from sessions s where s.id::text = $1`, [opts.sessionId]);
    session = row ? toSession(row) : undefined;
  }
  if (!session) return null;

  const counts = await tx.query<{ age_group: AgeGroup; n: number }>(
    `select age_group::text as age_group, count(*)::int as n from players where age_group = any($1::text[]::age_group[]) group by age_group`,
    [session.ageGroups],
  );
  const groups = session.ageGroups.filter((g) => counts.some((c) => c.age_group === g && c.n > 0));
  const group = isAgeGroup(opts.group) && session.ageGroups.includes(opts.group) ? opts.group : (groups[0] ?? session.ageGroups[0]);

  const rows = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    shirt_number: number | null;
    photo_consent: boolean | null;
    payment: PaymentState;
    answer: Availability | null;
    checked_in_at: Date | null;
  }>(
    `select p.id, p.first_name, p.last_name, p.shirt_number, p.photo_consent,
       coalesce(ps.state, 'missing')::text as payment, a.answer::text as answer, at.checked_in_at
     from players p
     left join payment_status ps on ps.player_id = p.id
     left join availability a on a.player_id = p.id and a.session_id = $1
     left join attendance at on at.player_id = p.id and at.session_id = $1
     where p.age_group = $2::age_group
     order by p.first_name, p.last_name`,
    [session.id, group],
  );

  return {
    session,
    todays,
    group,
    groups: groups.length ? groups : [group],
    rows: rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastInitial: r.last_name[0] ?? "",
      shirtNumber: r.shirt_number,
      answer: r.answer,
      checkedInAt: r.checked_in_at ? iso(r.checked_in_at) : null,
      flags: [
        ...(r.payment === "missing" || r.payment === "overdue" ? (["no_payment_plan"] as const) : []),
        ...(r.photo_consent === null ? (["missing_consent"] as const) : []),
      ],
    })),
  };
}

export function summarise(view: RegisterView) {
  const here = view.rows.filter((r) => r.checkedInAt).sort((a, b) => b.checkedInAt!.localeCompare(a.checkedInAt!));
  const away = view.rows.filter((r) => !r.checkedInAt && r.answer === "away");
  const notHere = view.rows.filter((r) => !r.checkedInAt && r.answer !== "away");
  return {
    here,
    latest: here.slice(0, 2),
    flagged: here.filter((r) => r.flags.length > 0),
    notHere,
    away,
    expectedTotal: view.rows.length - away.length,
  };
}
