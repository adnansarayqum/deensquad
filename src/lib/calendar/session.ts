import type { Queryable } from "../db/types";
import { sessionIsFor } from "../squads/sql";
import { description, summary, utcStamp, type CalendarSession } from "./ics";

// "Add to calendar" for one session, under a Coming answer on Friday: a Google Calendar link and a one-event .ics
// (GET /api/sessions/<id>/ics). The event has the same UID as the family feed's, so subscribing later updates it
// rather than adding a second copy.

/**
 * Google Calendar's "create event" page, filled in: title, UTC start/end (right across a clock change), venue and
 * the briefing. Nothing is sent to Google until the parent opens it and saves.
 */
export function googleCalendarUrl(s: CalendarSession): string {
  const params: [string, string][] = [
    ["action", "TEMPLATE"],
    ["text", summary(s)],
    ["dates", `${utcStamp(s.startsAt)}/${utcStamp(s.endsAt)}`],
    ["location", s.venue],
  ];
  const details = description(s);
  if (details) params.push(["details", details]);
  return `https://calendar.google.com/calendar/render?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/** The address of a session's one-event calendar file. */
export const sessionIcsPath = (sessionId: string) => `/api/sessions/${sessionId}/ics`;

/** "deen-squad-2026-10-09.ics", by the session's London date. */
export function sessionIcsFilename(startsAt: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(startsAt);
  return `deen-squad-${day}.ics`;
}

type Row = {
  id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  venue: string;
  arrive_by: string | null;
  kit: string | null;
  notes: string | null;
  cancelled: boolean;
  cancel_reason: string | null;
  children: string[];
};

const toSession = (r: Row): CalendarSession => ({
  id: r.id,
  title: r.title,
  startsAt: new Date(r.starts_at),
  endsAt: new Date(r.ends_at),
  venue: r.venue,
  children: r.children,
  arriveBy: r.arrive_by,
  kit: r.kit,
  notes: r.notes,
  cancelled: r.cancelled,
  cancelReason: r.cancel_reason,
});

const COLUMNS = `s.id, s.title, s.starts_at, s.ends_at, s.venue, s.arrive_by, s.kit, s.notes, s.cancelled_at is not null as cancelled, s.cancel_reason`;

/**
 * One session as a calendar event for the signed-in person (run as them, asUser): for a parent, only a session that's
 * for one of their own children (sessionIsFor, so a squad session only if one is picked), named with those children's
 * first names, as in the family feed. Staff can have any session (named with their own children, if any). Null otherwise.
 * The children are filtered to my_player_ids() explicitly, because a parent who is also staff can read the whole club.
 */
export async function loadCalendarSession(tx: Queryable, sessionId: string, staff: boolean): Promise<CalendarSession | null> {
  const [mine] = await tx.query<Row>(
    `select ${COLUMNS}, array_agg(distinct p.first_name::text order by p.first_name::text)::text[] as children
     from sessions s
     join players p on p.id in (select my_player_ids()) and ${sessionIsFor("s", "p")}
     where s.id = $1
     group by s.id`,
    [sessionId],
  );
  if (mine) return toSession(mine);
  if (!staff) return null;
  const [any] = await tx.query<Row>(`select ${COLUMNS}, '{}'::text[] as children from sessions s where s.id = $1`, [sessionId]);
  return any ? toSession(any) : null;
}
