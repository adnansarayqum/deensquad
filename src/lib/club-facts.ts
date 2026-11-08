import type { Queryable } from "./db/types";
import { londonIsoDay } from "./staff-checks/checks";

// Real facts for families who haven't joined yet (UX review, 8 Nov 2026: social proof and trust on the sign-up and
// trial pages). Every line comes from the club's own records at the moment the page is shown, and is left out
// when the records don't support it: never an invented testimonial, badge or figure.

export type ClubFacts = {
  /** Children in the club now (approved). */
  children: number;
  /** True only while every member of staff has a DBS check on record that hasn't run out. */
  everyoneDbsChecked: boolean;
  /** Where and when training usually is, from the sessions coming up: "Fridays at Bobby Moore Sports Hub". */
  training: { weekday: string; venue: string } | null;
};

/** Below this many children the count isn't shown: it would read as a club just starting, not as proof. */
export const SHOW_CHILDREN_FROM = 20;

export async function loadClubFacts(tx: Queryable, now: Date): Promise<ClubFacts> {
  const [kids] = await tx.query<{ n: number }>(`select count(*)::int as n from players where approved_at is not null`);
  const [dbs] = await tx.query<{ staff: number; missing: number }>(
    `select count(*)::int as staff,
       count(*) filter (where not exists (
         select 1 from staff_checks c where c.staff_id = s.id and c.kind = 'dbs' and (c.expires_on is null or c.expires_on >= $1::date)
       ))::int as missing
     from staff s`,
    [londonIsoDay(now)],
  );
  // The usual training night and place: the most common pair among the next eight weeks' training sessions, and only
  // when it is most of them (a club that moves around gets no line rather than a wrong one).
  const slots = await tx.query<{ weekday: string; venue: string; n: number; total: number }>(
    `select trim(to_char(s.starts_at at time zone 'Europe/London', 'Day')) as weekday, s.venue, count(*)::int as n,
       sum(count(*)) over ()::int as total
     from sessions s
     where s.kind = 'training' and s.cancelled_at is null and s.starts_at > $1::timestamptz
       and s.starts_at < $1::timestamptz + interval '56 days' and coalesce(s.venue, '') <> ''
       and not exists (select 1 from session_squads q where q.session_id = s.id)
     group by 1, 2 order by n desc, 1 limit 1`,
    [now],
  );
  const top = slots[0];
  const venueKnown = top && !/\b(tbc|tba|to be (confirmed|announced))\b/i.test(top.venue);
  return {
    children: kids.n,
    everyoneDbsChecked: dbs.staff > 0 && dbs.missing === 0,
    training: top && venueKnown && top.n * 2 > top.total ? { weekday: top.weekday, venue: top.venue.trim() } : null,
  };
}

/** The lines to show, in order. Empty when the club's records support none of them. */
export function clubFactLines(f: ClubFacts): { icon: "children" | "dbs" | "pitch"; text: string }[] {
  const lines: { icon: "children" | "dbs" | "pitch"; text: string }[] = [];
  if (f.training) lines.push({ icon: "pitch", text: `Training ${f.training.weekday}s at ${f.training.venue}` });
  if (f.children >= SHOW_CHILDREN_FROM) lines.push({ icon: "children", text: `${f.children} children train with the club` });
  if (f.everyoneDbsChecked) lines.push({ icon: "dbs", text: "Every coach is DBS-checked" });
  return lines;
}
