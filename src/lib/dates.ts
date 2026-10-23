// Date helpers. The club runs on UK time, so every label is formatted for Europe/London.

const TZ = "Europe/London";

/** Offset in minutes between UTC and Europe/London at the given instant (0 in winter, 60 in summer). */
export function londonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The UTC instant for a wall-clock time in London on the given calendar day. */
export function londonTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = londonOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60000);
}

/** The London calendar date (y, m, d, weekday 0=Sun) for an instant. */
export function londonDate(at: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

/** The London calendar date as YYYY-MM-DD (a date input's value). */
export function londonIsoDate(at: Date): string {
  const d = londonDate(at);
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** Whether two instants fall on the same London calendar day. */
export function sameLondonDay(a: Date, b: Date): boolean {
  const x = londonDate(a);
  const y = londonDate(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

/**
 * The next Friday training (6:30pm London) that has not yet finished at `now`.
 * On a Friday before 8pm this returns today's session.
 */
export function nextFridaySession(now: Date): { start: Date; end: Date } {
  const today = londonDate(now);
  let daysAhead = (5 - today.weekday + 7) % 7;
  const base = Date.UTC(today.year, today.month - 1, today.day);
  for (;;) {
    const d = new Date(base + daysAhead * 86400000);
    const start = londonTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 18, 30);
    const end = londonTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 20, 0);
    if (end.getTime() > now.getTime()) return { start, end };
    daysAhead += 7;
  }
}

export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * 86400000);
}

/** "Fri 9 Oct" */
export function shortDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}

/** "6:30pm" */
export function clock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso))
    .replace(" ", "")
    .toLowerCase();
}

/** "Today 09:12", "Yesterday 17:40", "Mon 17:40" or "28 Sept" for older posts. */
export function postedLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  // One clock everywhere parents see a time: 7:18pm, as on the session cards.
  const time = clock(iso);
  const a = londonDate(at);
  const b = londonDate(now);
  const dayDiff = Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000,
  );
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff < 7) return `${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(at)} ${time}`;
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(at);
}

/** Whole days from `now` until `iso` (0 when it is today). */
export function daysUntil(iso: string, now: Date): number {
  const a = londonDate(now);
  const b = londonDate(new Date(iso));
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}

/** London calendar days from `now` to `iso` (0 = the same day, 7 = a week on). */
export function londonDaysAhead(iso: string, now: Date): number {
  const a = londonDate(now);
  const b = londonDate(new Date(iso));
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}

const weekdayName = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long" }).format(new Date(iso));

/**
 * When a session is, in words that can't be mistaken for another week: "today", "tomorrow", "this Wednesday"
 * (2 to 6 days ahead), "next Friday" (7 to 13), else "on Fri 6 Nov". Parents read a bare "Fri 30 Oct" under a
 * cancelled card for today's session as this week's question.
 */
export function whenWords(iso: string, now: Date): string {
  const days = londonDaysAhead(iso, now);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days >= 2 && days <= 6) return `this ${weekdayName(iso)}`;
  if (days >= 7 && days <= 13) return `next ${weekdayName(iso)}`;
  return `on ${shortDay(iso)}`;
}

/** A session's day as a heading: "Today", "Tomorrow", "This Wednesday, 28 Oct", "Next Friday, 30 Oct", else "Fri 6 Nov". */
export function dayHeading(iso: string, now: Date): string {
  const words = whenWords(iso, now);
  if (words === "today" || words === "tomorrow") return words[0].toUpperCase() + words.slice(1);
  if (words.startsWith("on ")) return shortDay(iso);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
  return `${words[0].toUpperCase()}${words.slice(1)}, ${date}`;
}

/** "Friday 30 October" */
export function longDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}
