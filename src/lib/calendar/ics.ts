// The family calendar feed (GET /api/calendar/<token>.ics) as iCalendar text (RFC 5545). Pure: no database.
// Times are written in UTC ("Z"), which every calendar app shows in the viewer's own time zone, so a session at
// 6:30pm London reads 6:30pm on both sides of a clock change. A Europe/London VTIMEZONE is always included (a valid calendar even with no events).

export const CALENDAR_DOMAIN = "thedeensquadfootballacademy.co.uk";

export type CalendarSession = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  venue: string;
  /** Children's first names only, never surnames. */
  children: string[];
  arriveBy: string | null;
  kit: string | null;
  notes: string | null;
  cancelled: boolean;
  cancelReason: string | null;
};

/** TEXT value escaping: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line at 75 octets (UTF-8), continuing with CRLF and a space. Never splits a character:
 * a multi-byte character that wouldn't fit goes onto the next line whole.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** 20261009T173000Z */
export function utcStamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** "Training (Yusuf and Musa)", or "Cancelled: Training (Yusuf)". Shared with the Google Calendar link. */
export function summary(s: CalendarSession): string {
  const who = s.children.length ? ` (${listNames(s.children)})` : "";
  return `${s.cancelled ? "Cancelled: " : ""}${s.title}${who}`;
}

function listNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Arrive by, kit and notes (and why it's cancelled), one per line. Shared with the Google Calendar link. */
export function description(s: CalendarSession): string {
  const lines: string[] = [];
  if (s.cancelled) lines.push(s.cancelReason ? `Cancelled: ${s.cancelReason}` : "This session is cancelled.");
  if (s.arriveBy) lines.push(`Arrive by: ${s.arriveBy}`);
  if (s.kit) lines.push(`Kit: ${s.kit}`);
  if (s.notes) lines.push(s.notes);
  return lines.join("\n");
}

const LONDON = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/London",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0000",
  "TZOFFSETTO:+0100",
  "TZNAME:BST",
  "DTSTART:19700329T010000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0000",
  "TZNAME:GMT",
  "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** The whole feed. `now` is the DTSTAMP of every event (when this copy was made). */
export function buildCalendar(sessions: CalendarSession[], now: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Deen Squad Football Academy//Parent app//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Deen Squad",
    "X-WR-TIMEZONE:Europe/London",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    // Always there, so a family with no sessions still gets a valid calendar (RFC 5545 needs one component).
    // Events are in UTC; this describes the club's own time zone for apps that show it.
    ...LONDON,
  ];
  for (const s of sessions) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@${CALENDAR_DOMAIN}`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${utcStamp(s.startsAt)}`,
      `DTEND:${utcStamp(s.endsAt)}`,
      `SUMMARY:${escapeText(summary(s))}`,
      `LOCATION:${escapeText(s.venue)}`,
    );
    const text = description(s);
    if (text) lines.push(`DESCRIPTION:${escapeText(text)}`);
    lines.push(`STATUS:${s.cancelled ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
