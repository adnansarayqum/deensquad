import type { Queryable } from "../db/types";
import { type Audience, nextOccurrence } from "./events";

export type CommunityEvent = {
  id: string;
  title: string;
  audience: Audience;
  startsAt: Date;
  endsAt: Date | null;
  weekly: boolean;
  repeatUntil: string | null;
  venue: string | null;
  details: string | null;
  howToJoin: string | null;
  linkUrl: string | null;
  active: boolean;
};

/** Every event the asker may read: the ones on show, and for admins the hidden ones too (RLS decides). */
export async function loadEvents(tx: Queryable): Promise<CommunityEvent[]> {
  const rows = await tx.query<{
    id: string;
    title: string;
    audience: Audience;
    starts_at: Date;
    ends_at: Date | null;
    weekly: boolean;
    repeat_until: string | null;
    venue: string | null;
    details: string | null;
    how_to_join: string | null;
    link_url: string | null;
    active: boolean;
  }>(
    `select id, title, audience, starts_at, ends_at, weekly, repeat_until::text as repeat_until, venue, details, how_to_join, link_url, active
     from community_events order by starts_at, id`,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    audience: r.audience,
    startsAt: new Date(r.starts_at),
    endsAt: r.ends_at ? new Date(r.ends_at) : null,
    weekly: r.weekly,
    repeatUntil: r.repeat_until,
    venue: r.venue,
    details: r.details,
    howToJoin: r.how_to_join,
    linkUrl: r.link_url,
    active: r.active,
  }));
}

export type UpcomingEvent = CommunityEvent & { start: Date; end: Date | null };

/** The events on show that are still to come (or on now), soonest first, each with when it next happens. */
export function upcomingEvents(events: CommunityEvent[], now: Date): UpcomingEvent[] {
  return events
    .filter((e) => e.active)
    .flatMap((e) => {
      const next = nextOccurrence(e, now);
      return next ? [{ ...e, start: next.start, end: next.end }] : [];
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
}
