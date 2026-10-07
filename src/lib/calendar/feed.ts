import { createHash, randomBytes } from "node:crypto";
import type { Queryable } from "../db/types";
import { sessionIsFor } from "../squads/sql";
import type { CalendarSession } from "./ics";

// A parent's private calendar feed (Player → Calendar). The token is 32 random bytes in hex and lives only in the
// link; the database keeps its SHA-256 (guardians.calendar_token_hash, migration 0019), as it does for sign-in
// sessions. Calendar apps fetch the feed without a cookie, so the token is the only key: the feed holds the family's
// sessions with children's first names, never surnames or anyone else's data.

export const FEED_PAST_DAYS = 30;
export const FEED_AHEAD_MONTHS = 6;

export function newCalendarToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashCalendarToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The token from the last path segment (`<token>.ics`), or null if it can't be one. */
export function tokenFromFile(file: string): string | null {
  const m = /^([0-9a-f]{64})\.ics$/.exec(file);
  return m ? m[1] : null;
}

/** Makes (or replaces) the signed-in parent's token and returns it. Run as the parent (asUser). */
export async function setMyCalendarToken(tx: Queryable): Promise<string> {
  const token = newCalendarToken();
  await tx.query(`select set_calendar_token($1)`, [hashCalendarToken(token)]);
  return token;
}

/** When the signed-in parent's calendar link was made, or null if they haven't one. */
export async function loadMyCalendarLink(tx: Queryable): Promise<Date | null> {
  const [row] = await tx.query<{ at: Date | null }>(`select calendar_token_created_at as at from guardians where id = my_guardian_id()`);
  return row?.at ?? null;
}

/** The parent a token belongs to. Run with the system connection (no one is signed in). */
export async function guardianForToken(tx: Queryable, token: string): Promise<string | null> {
  const [row] = await tx.query<{ id: string }>(`select id from guardians where calendar_token_hash = $1`, [hashCalendarToken(token)]);
  return row?.id ?? null;
}

/**
 * The sessions a parent sees for their children, from 30 days ago to 6 months ahead: their children's groups, and
 * squad sessions only for children picked (sessionIsFor, as on Friday). Cancelled ones stay, so calendars show them
 * cancelled rather than leaving the old event. Written for the system connection, so every rule is explicit here.
 */
export async function loadFeedSessions(tx: Queryable, guardianId: string, now: Date): Promise<CalendarSession[]> {
  const from = new Date(now.getTime() - FEED_PAST_DAYS * 86400000);
  const to = new Date(now);
  to.setUTCMonth(to.getUTCMonth() + FEED_AHEAD_MONTHS);
  const rows = await tx.query<{
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
  }>(
    `select s.id, s.title, s.starts_at, s.ends_at, s.venue, s.arrive_by, s.kit, s.notes,
       s.cancelled_at is not null as cancelled, s.cancel_reason,
       array_agg(distinct p.first_name::text order by p.first_name::text)::text[] as children
     from sessions s
     join players p on ${sessionIsFor("s", "p")}
     join player_guardians pg on pg.player_id = p.id and pg.guardian_id = $1
     where s.starts_at >= $2 and s.starts_at <= $3
     group by s.id
     order by s.starts_at, s.id`,
    [guardianId, from, to],
  );
  return rows.map((r) => ({
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
  }));
}

/** Calendar links for a token: the https feed, webcal:// for iPhone/Mac, and Google Calendar's "add by URL". */
export function calendarLinks(base: string, token: string) {
  const https = `${base.replace(/\/+$/, "")}/api/calendar/${token}.ics`;
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}

// Light caps, in memory (the app runs as one instance; a restart only resets the counts):
// - 60 fetches an hour per link: calendar apps poll every few hours, so anything more is a script or a loop;
// - 30 unknown links an hour per address: someone trying links gets 429s before any more database lookups.
// Each store holds at most 5,000 keys and, when full, drops expired then oldest entries, so a flood of made-up links
// can't reset the counts of real ones.
export const FEED_LIMIT = 60;
export const MISS_LIMIT = 30;
const WINDOW_MS = 60 * 60_000;
export const MAX_TRACKED = 5_000;

/** A fixed-window counter per key. `hit` counts and says whether that hit is within the limit; `over` only looks. */
export function windowCounter(limit: number, windowMs = WINDOW_MS, maxKeys = MAX_TRACKED) {
  // Insertion order is window-start order: a key whose window restarts is moved to the end.
  const hits = new Map<string, { start: number; count: number }>();
  const live = (key: string, now: number) => {
    const entry = hits.get(key);
    return entry && now - entry.start < windowMs ? entry : undefined;
  };
  return {
    hit(key: string, now = Date.now()): boolean {
      const entry = live(key, now);
      if (entry) return ++entry.count <= limit;
      hits.delete(key);
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) {
          if (now - v.start < windowMs) break;
          hits.delete(k);
        }
        while (hits.size >= maxKeys) hits.delete(hits.keys().next().value!);
      }
      hits.set(key, { start: now, count: 1 });
      return limit >= 1;
    },
    over(key: string, now = Date.now()): boolean {
      return (live(key, now)?.count ?? 0) >= limit;
    },
    has: (key: string) => hits.has(key),
    clear: () => hits.clear(),
  };
}

const perLink = windowCounter(FEED_LIMIT);
const misses = windowCounter(MISS_LIMIT);

/** Counts a fetch of a link (by its hash); false once it's had 60 this hour. */
export function allowFeed(key: string, now = Date.now()): boolean {
  return perLink.hit(key, now);
}

/** False when this address has asked for 30 unknown links this hour (checked before the lookup). */
export function allowLookupFrom(ip: string | null, now = Date.now()): boolean {
  return !misses.over(ip ?? "unknown", now);
}

/** Records a lookup of a link that doesn't exist. */
export function recordMiss(ip: string | null, now = Date.now()) {
  misses.hit(ip ?? "unknown", now);
}

export function resetFeedLimit() {
  perLink.clear();
  misses.clear();
}
