import type { AgeGroup } from "../domain";
import type { Queryable } from "../db/types";
import { newsReaches } from "../squads/sql";

// The App use page (/admin/app-use): how many parents open the app, how long a visit lasts, whether posts are seen
// and read, when parents read, and who hasn't opened the app lately. Parents are those with an approved child in
// `groups` (a group coach's own, else every group). Screen time is the club's total only (app_use_daily).

/** A parent counts as gone quiet after this many days without opening the app. */
export const QUIET_DAYS = 14;
/** The London day opens were first recorded (migration 0055 went live). Before then nobody has an open on record. */
export const RECORDED_FROM = "2026-11-23";

export type AppUse = {
  /** Parents with an approved child in the groups; how many have ever signed in. */
  parents: number;
  signedIn: number;
  /** Parents who opened the app today, in the last 7 days and in the last 30 (London days, today included). */
  today: number;
  week: number;
  month: number;
  /** The last 30 London days, oldest first: parents who opened the app that day. */
  daily: { day: string; parents: number }[];
  /** The whole club's last 30 days: visits and the average visit, in seconds (null before any visit ended). */
  visits: number;
  averageSeconds: number | null;
  /** The last 8 posts that asked for a tap: reached, seen, read, read within a day, read from the notification. */
  posts: { id: string; title: string; postedAt: string; reached: number; seen: number; read: number; readInADay: number; fromNotification: number }[];
  /** Reads in the last 60 days by London hour of the day (0–23): when to post. */
  readHours: number[];
  /**
   * Parents on the app who haven't opened it for QUIET_DAYS or more, longest first. A parent with no open on record
   * is listed only once opens have been recorded for QUIET_DAYS (`quietFrom`, null once that day has come): before
   * then "no open on record" only means "not since recording began", which on day two was nearly everyone.
   */
  quietFrom: string | null;
  quiet: { id: string; name: string; children: string; lastOpened: string | null }[];
};

export async function loadAppUse(tx: Queryable, groups: readonly AgeGroup[], recordedFrom: string = RECORDED_FROM): Promise<AppUse> {
  const g = [...groups];
  const mine = `select distinct pg.guardian_id as id from player_guardians pg join players p on p.id = pg.player_id
    where p.approved_at is not null and p.age_group::text = any ($1::text[])`;
  const today = `(now() at time zone 'Europe/London')::date`;
  const [counts] = await tx.query<{ parents: number; signed_in: number; today: number; week: number; month: number }>(
    `with mine as (${mine})
     select (select count(*)::int from mine) as parents,
       (select count(*)::int from mine join guardians gu on gu.id = mine.id where gu.auth_user_id is not null) as signed_in,
       (select count(distinct o.guardian_id)::int from app_opens o join mine on mine.id = o.guardian_id where o.day = ${today}) as today,
       (select count(distinct o.guardian_id)::int from app_opens o join mine on mine.id = o.guardian_id where o.day > ${today} - 7) as week,
       (select count(distinct o.guardian_id)::int from app_opens o join mine on mine.id = o.guardian_id where o.day > ${today} - 30) as month`,
    [g],
  );
  const daily = await tx.query<{ day: string; parents: number }>(
    `with mine as (${mine})
     select d.day::date::text as day, count(distinct o.guardian_id)::int as parents
     from generate_series(${today} - 29, ${today}, interval '1 day') as d(day)
     left join app_opens o on o.day = d.day::date and o.guardian_id in (select id from mine)
     group by d.day order by d.day`,
    [g],
  );
  const [time] = await tx.query<{ visits: number; seconds: number }>(
    `select coalesce(sum(visits), 0)::int as visits, coalesce(sum(seconds), 0)::int as seconds from app_use_daily where day > ${today} - 30`,
  );
  const posts = await tx.query<{
    id: string;
    title: string;
    posted_at: Date;
    reached: number;
    seen: number;
    read: number;
    read_in_a_day: number;
    from_notification: number;
  }>(
    `with mine as (${mine}),
     recent as (
       select a.* from announcements a
       where a.requires_ack and (a.audience is null or cardinality(a.audience) = 0 or a.audience::text[] && $1::text[])
       order by a.posted_at desc limit 8
     ),
     reach as (
       select distinct a.id as announcement_id, pg.guardian_id from recent a
       join players p on p.approved_at is not null and p.age_group::text = any ($1::text[]) and ${newsReaches("a", "p")}
       join player_guardians pg on pg.player_id = p.id
     )
     select a.id, a.title, a.posted_at,
       (select count(*)::int from reach where reach.announcement_id = a.id) as reached,
       (select count(*)::int from reach where reach.announcement_id = a.id
          and (exists (select 1 from announcement_views v where v.announcement_id = a.id and v.guardian_id = reach.guardian_id)
            or exists (select 1 from announcement_reads r where r.announcement_id = a.id and r.guardian_id = reach.guardian_id))) as seen,
       (select count(*)::int from reach join announcement_reads r on r.announcement_id = a.id and r.guardian_id = reach.guardian_id where reach.announcement_id = a.id) as read,
       (select count(*)::int from reach join announcement_reads r on r.announcement_id = a.id and r.guardian_id = reach.guardian_id
          where reach.announcement_id = a.id and r.read_at <= a.posted_at + interval '24 hours') as read_in_a_day,
       (select count(*)::int from reach join announcement_reads r on r.announcement_id = a.id and r.guardian_id = reach.guardian_id
          where reach.announcement_id = a.id and r.via = 'notification') as from_notification
     from recent a order by a.posted_at desc`,
    [g],
  );
  const hours = await tx.query<{ hour: number; reads: number }>(
    `with mine as (${mine})
     select extract(hour from r.read_at at time zone 'Europe/London')::int as hour, count(*)::int as reads
     from announcement_reads r join mine on mine.id = r.guardian_id
     where r.read_at > now() - interval '60 days'
     group by 1`,
    [g],
  );
  const [{ quiet_from: quietFrom }] = await tx.query<{ quiet_from: string | null }>(
    `select case when ${today} < $1::date + $2::int then ($1::date + $2::int)::text end as quiet_from`,
    [recordedFrom, QUIET_DAYS],
  );
  const quiet = await tx.query<{ id: string; first_name: string; last_name: string; children: string; last_opened: string | null }>(
    `with mine as (${mine})
     select gu.id, gu.first_name, gu.last_name,
       (select string_agg(p.first_name || ' (' || p.age_group::text || ')', ', ' order by p.first_name)
        from player_guardians pg join players p on p.id = pg.player_id where pg.guardian_id = gu.id and p.age_group::text = any ($1::text[])) as children,
       (select max(o.day)::text from app_opens o where o.guardian_id = gu.id) as last_opened
     from guardians gu join mine on mine.id = gu.id
     where gu.auth_user_id is not null
       and not exists (select 1 from app_opens o where o.guardian_id = gu.id and o.day > ${today} - $2::int)
       and (${today} >= $3::date + $2::int or exists (select 1 from app_opens o where o.guardian_id = gu.id))
     order by last_opened nulls first, gu.last_name, gu.first_name
     limit 100`,
    [g, QUIET_DAYS, recordedFrom],
  );
  const readHours = Array.from({ length: 24 }, (_, h) => hours.find((r) => r.hour === h)?.reads ?? 0);
  return {
    parents: counts.parents,
    signedIn: counts.signed_in,
    today: counts.today,
    week: counts.week,
    month: counts.month,
    daily,
    visits: time.visits,
    averageSeconds: time.visits > 0 && time.seconds > 0 ? Math.round(time.seconds / time.visits) : null,
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      postedAt: new Date(p.posted_at).toISOString(),
      reached: p.reached,
      seen: Math.max(p.seen, p.read),
      read: p.read,
      readInADay: p.read_in_a_day,
      fromNotification: p.from_notification,
    })),
    readHours,
    quietFrom,
    quiet: quiet.map((q) => ({ id: q.id, name: `${q.first_name} ${q.last_name}`, children: q.children ?? "", lastOpened: q.last_opened })),
  };
}

/** "2 min 10 s", "45 s": an average visit, for people. */
export function visitLength(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** The busiest stretch of the day for reading posts: "7pm to 9pm", from the hourly reads (null with too few). */
export function busiestHours(readHours: readonly number[], minReads = 10): string | null {
  const total = readHours.reduce((a, b) => a + b, 0);
  if (total < minReads) return null;
  let best = 0;
  let bestSum = -1;
  for (let h = 0; h < 24; h++) {
    const sum = readHours[h] + readHours[(h + 1) % 24];
    if (sum > bestSum) {
      bestSum = sum;
      best = h;
    }
  }
  return `${clockHour(best)} to ${clockHour((best + 2) % 24)}`;
}

function clockHour(h: number): string {
  if (h === 0) return "midnight";
  if (h === 12) return "midday";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
