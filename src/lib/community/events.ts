// What's on: the pure parts. When a weekly event next happens, and how an event's day and time are said.
import { addDays, londonDate, londonIsoDate, londonOffsetMinutes, londonTime } from "../dates";

export const AUDIENCES = ["everyone", "brothers", "sisters", "children"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABELS: Record<Audience, string> = {
  everyone: "For everyone",
  brothers: "For brothers",
  sisters: "For sisters",
  children: "For children",
};
export const isAudience = (value: unknown): value is Audience => typeof value === "string" && (AUDIENCES as readonly string[]).includes(value);

/** How long an event with no finish time is taken to last, for deciding when it's over. */
export const DEFAULT_LENGTH_MS = 2 * 60 * 60 * 1000;

export type EventTimes = { startsAt: Date; endsAt: Date | null; weekly: boolean; repeatUntil: string | null };

/** The London wall-clock hour and minute of an instant. */
function londonClock(at: Date): { hour: number; minute: number } {
  const local = new Date(at.getTime() + londonOffsetMinutes(at) * 60000);
  return { hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

/**
 * When the event next happens (or is happening now), or null once it's over. A weekly event keeps its London
 * weekday and clock time across the clock change, never starts before its first date, and stops after repeat_until.
 */
export function nextOccurrence(e: EventTimes, now: Date): { start: Date; end: Date | null } | null {
  const length = e.endsAt ? e.endsAt.getTime() - e.startsAt.getTime() : null;
  const over = (start: Date) => start.getTime() + (length ?? DEFAULT_LENGTH_MS) <= now.getTime();
  const at = (start: Date) => ({ start, end: length === null ? null : new Date(start.getTime() + length) });
  if (!e.weekly) return over(e.startsAt) ? null : at(e.startsAt);

  let start = e.startsAt;
  if (over(start)) {
    const first = londonDate(e.startsAt);
    const { hour, minute } = londonClock(e.startsAt);
    const today = londonDate(now);
    const ahead = (first.weekday - today.weekday + 7) % 7;
    start = londonTime(today.year, today.month, today.day + ahead, hour, minute);
    if (over(start)) {
      const next = londonDate(addDays(start, 7));
      start = londonTime(next.year, next.month, next.day, hour, minute);
    }
  }
  if (e.repeatUntil && londonIsoDate(start) > e.repeatUntil) return null;
  return at(start);
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/London" });
const DATE = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Europe/London" });
const clock = (at: Date) => TIME.format(at).replace(/\s/g, "").replace(":00", "").toLowerCase();

/** "Every Thursday · 8pm to 9pm" for a weekly event, "Sat 12 Dec · 10am" for a one-off. */
export function eventWhen(weekly: boolean, start: Date, end: Date | null): string {
  const time = end ? `${clock(start)} to ${clock(end)}` : clock(start);
  return weekly ? `Every ${DAY.format(start)} · ${time}` : `${DATE.format(start).replace(",", "")} · ${time}`;
}

/** The date tile's two lines: "THU" over "26". */
export function eventTile(start: Date): { top: string; bottom: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "Europe/London" }).formatToParts(start);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { top: get("weekday").toUpperCase(), bottom: get("day") };
}

/** "2026-11-26T20:00" in London, for a datetime-local box. */
export function londonInputValue(at: Date | null): string {
  if (!at) return "";
  const { hour, minute } = londonClock(at);
  return `${londonIsoDate(at)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "20:00" in London, for a time box. */
export function londonTimeValue(at: Date | null): string {
  return at ? londonInputValue(at).slice(11) : "";
}
