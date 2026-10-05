import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { londonDate, londonTime } from "../dates";
import { AGE_GROUPS, type AgeGroup, type PaymentState } from "../domain";
import { seasonStart } from "../exports/reports";
import { NEEDS, TODO_NEEDS } from "./needs";

// The numbers on the club admin overview (/admin). Every figure is counted in SQL over the
// children in `groups` (a group coach's own, or every group), so a coach never sees another
// group's numbers. Runs inside one asUser transaction; row level security still applies.

export type NextSessionGroup = {
  group: AgeGroup;
  squad: number;
  session: { id: string; title: string; startsAt: string } | null;
  coming: number;
  away: number;
  unanswered: number;
};

export type SeasonGroup = {
  group: AgeGroup;
  squad: number;
  /** Sessions for this group that have finished this season (from 1 August), not counting cancelled ones. */
  held: number;
  checkedIn: number;
  /** Checked in ÷ (sessions held × squad size), as a whole percentage. Null when there's nothing to divide by. */
  averagePct: number | null;
};

export type RecentSession = { id: string; title: string; startsAt: string; checkedIn: number };

export type NewsAck = { id: string; title: string; postedAt: string; read: number; total: number };

export const CHANNELS = ["app", "email", "sms", "whatsapp", "gate"] as const;
export type Channel = (typeof CHANNELS)[number];

export type Dashboard = {
  players: number;
  attendance: { next: NextSessionGroup[]; season: SeasonGroup[]; recent: RecentSession[] };
  families: {
    parents: number;
    signedIn: number;
    invited: number;
    notInvited: number;
    todo: Record<(typeof TODO_NEEDS)[number], number>;
  };
  payments: Record<PaymentState, number>;
  /** Admins only (the shop is theirs to run); null for coaches. */
  shop: { awaitingPayment: number; toOrder: number; ready: number; monthPence: number; seasonPence: number } | null;
  news: { recent: NewsAck[]; reminders: Record<Channel, number>; behind: number };
};

/** Midnight on the 1st of the London month `now` falls in. */
export function monthStart(now: Date): Date {
  const d = londonDate(now);
  return londonTime(d.year, d.month, 1, 0, 0);
}

export function averagePct(checkedIn: number, held: number, squad: number): number | null {
  return held > 0 && squad > 0 ? Math.round((checkedIn / (held * squad)) * 100) : null;
}

// A message reaches a child when it's for everyone (null or empty audience) or for the child's group.
const reaches = `(a.audience is null or cardinality(a.audience) = 0 or p.age_group = any (a.audience))`;

/**
 * Everything on the overview. `limit` is a group coach's own groups (coachLimit), or null for the
 * whole club; `withShop` is for admins only.
 */
export async function loadDashboard(
  tx: Queryable,
  { now, limit, withShop }: { now: Date; limit: readonly AgeGroup[] | null; withShop: boolean },
): Promise<Dashboard> {
  const groups = limit ? AGE_GROUPS.filter((g) => limit.includes(g)) : [...AGE_GROUPS];
  const season = seasonStart(now);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const [next, seasonRows, recent, family, shop, news, reminders, behind] = await Promise.all([
    tx.query<{ group: AgeGroup; squad: number; id: string | null; title: string | null; starts_at: Date | null; coming: number; away: number }>(
      `select g.grp as "group", s.id, s.title, s.starts_at,
         (select count(*)::int from players p where p.age_group::text = g.grp) as squad,
         (select count(*)::int from availability v join players p on p.id = v.player_id
           where v.session_id = s.id and p.age_group::text = g.grp and v.answer = 'coming') as coming,
         (select count(*)::int from availability v join players p on p.id = v.player_id
           where v.session_id = s.id and p.age_group::text = g.grp and v.answer = 'away') as away
       from unnest($1::text[]) with ordinality as g (grp, ord)
       left join lateral (
         select s.id, s.title, s.starts_at from sessions s
         where s.ends_at > $2 and s.cancelled_at is null and g.grp = any (s.age_groups::text[])
         order by s.starts_at, s.created_at limit 1
       ) s on true
       order by g.ord`,
      [groups, now],
    ),
    tx.query<{ group: AgeGroup; squad: number; held: number; checked_in: number }>(
      `select g.grp as "group",
         (select count(*)::int from players p where p.age_group::text = g.grp) as squad,
         count(s.id)::int as held,
         coalesce(sum(c.n), 0)::int as checked_in
       from unnest($1::text[]) with ordinality as g (grp, ord)
       left join sessions s on g.grp = any (s.age_groups::text[]) and s.starts_at >= $2 and s.ends_at <= $3 and s.cancelled_at is null
       left join lateral (
         select count(*)::int as n from attendance a join players p on p.id = a.player_id
         where a.session_id = s.id and p.age_group::text = g.grp
       ) c on true
       group by g.grp, g.ord
       order by g.ord`,
      [groups, season, now],
    ),
    tx.query<{ id: string; title: string; starts_at: Date; checked_in: number }>(
      `select s.id, s.title, s.starts_at,
         (select count(*)::int from attendance a join players p on p.id = a.player_id
           where a.session_id = s.id and p.age_group::text = any ($1::text[])) as checked_in
       from sessions s
       where s.ends_at <= $2 and s.cancelled_at is null and s.age_groups::text[] && $1::text[]
       order by s.starts_at desc limit 8`,
      [groups, now],
    ),
    tx.query<Record<string, number>>(
      `with mine as (select p.* from players p where p.age_group::text = any ($1::text[])),
       parents as (
         select distinct g.id, g.auth_user_id, g.invited_at from guardians g
         join player_guardians pg on pg.guardian_id = g.id join mine on mine.id = pg.player_id
       )
       select
         (select count(*)::int from mine) as players,
         (select count(*)::int from parents) as parents,
         (select count(*)::int from parents where auth_user_id is not null) as "signedIn",
         (select count(*)::int from parents where auth_user_id is null and invited_at is not null) as invited,
         (select count(*)::int from parents where auth_user_id is null and invited_at is null) as "notInvited",
         ${TODO_NEEDS.map((n) => `(select count(*)::int from mine p where ${NEEDS[n].where}) as "todo_${n}"`).join(",\n         ")},
         ${(["active", "self_reported", "missing", "overdue"] as const)
           .map((st) => `(select count(*)::int from mine p left join payment_status ps on ps.player_id = p.id where coalesce(ps.state::text, 'missing') = '${st}') as "pay_${st}"`)
           .join(",\n         ")}`,
      [groups],
    ),
    withShop
      ? tx.query<{ awaiting_payment: number; to_order: number; ready: number; month_pence: number; season_pence: number }>(
          `select
             count(*) filter (where status = 'awaiting_payment')::int as awaiting_payment,
             count(*) filter (where status = 'paid')::int as to_order,
             count(*) filter (where status = 'ready')::int as ready,
             coalesce(sum(total_pence) filter (where status in ('paid', 'ordered', 'ready', 'collected') and paid_at >= $1), 0)::int as month_pence,
             coalesce(sum(total_pence) filter (where status in ('paid', 'ordered', 'ready', 'collected') and paid_at >= $2), 0)::int as season_pence
           from shop_orders`,
          [monthStart(now), season],
        )
      : Promise.resolve(null),
    tx.query<{ id: string; title: string; posted_at: Date; total: number; read: number }>(
      `select a.id, a.title, a.posted_at,
         (select count(distinct pg.guardian_id)::int from player_guardians pg join players p on p.id = pg.player_id
           where ${reaches} and p.age_group::text = any ($1::text[])) as total,
         (select count(distinct r.guardian_id)::int from announcement_reads r
           join player_guardians pg on pg.guardian_id = r.guardian_id join players p on p.id = pg.player_id
           where r.announcement_id = a.id and ${reaches} and p.age_group::text = any ($1::text[])) as read
       from announcements a
       where a.requires_ack and (a.audience is null or cardinality(a.audience) = 0 or a.audience::text[] && $1::text[])
       order by a.posted_at desc limit 5`,
      [groups],
    ),
    tx.query<{ channel: Channel; n: number }>(
      `select c.channel::text as channel, count(*)::int as n from announcement_chases c
       where c.sent_at > $2 and c.sent_at <= $3 and exists (
         select 1 from player_guardians pg join players p on p.id = pg.player_id
         where pg.guardian_id = c.guardian_id and p.age_group::text = any ($1::text[]))
       group by c.channel`,
      [groups, weekAgo, now],
    ),
    tx.query<{ n: number }>(
      `select count(*)::int as n from guardians g
       where (
         select count(*) from announcements a
         where a.requires_ack and a.posted_at <= $2
           and exists (select 1 from player_guardians pg join players p on p.id = pg.player_id
                       where pg.guardian_id = g.id and p.age_group::text = any ($1::text[]) and ${reaches})
           and not exists (select 1 from announcement_reads r where r.announcement_id = a.id and r.guardian_id = g.id)
       ) >= 2`,
      [groups, now],
    ),
  ]);

  const f = family[0];
  const s = shop?.[0];
  return {
    players: f.players,
    attendance: {
      next: next.map((r) => ({
        group: r.group,
        squad: r.squad,
        session: r.id ? { id: r.id, title: r.title ?? "", startsAt: iso(r.starts_at) } : null,
        coming: r.coming,
        away: r.away,
        unanswered: Math.max(0, r.squad - r.coming - r.away),
      })),
      season: seasonRows.map((r) => ({
        group: r.group,
        squad: r.squad,
        held: r.held,
        checkedIn: r.checked_in,
        averagePct: averagePct(r.checked_in, r.held, r.squad),
      })),
      recent: recent.reverse().map((r) => ({ id: r.id, title: r.title, startsAt: iso(r.starts_at), checkedIn: r.checked_in })),
    },
    families: {
      parents: f.parents,
      signedIn: f.signedIn,
      invited: f.invited,
      notInvited: f.notInvited,
      todo: Object.fromEntries(TODO_NEEDS.map((n) => [n, f[`todo_${n}`]])) as Dashboard["families"]["todo"],
    },
    payments: { active: f.pay_active, self_reported: f.pay_self_reported, missing: f.pay_missing, overdue: f.pay_overdue },
    shop: s
      ? { awaitingPayment: s.awaiting_payment, toOrder: s.to_order, ready: s.ready, monthPence: s.month_pence, seasonPence: s.season_pence }
      : null,
    news: {
      recent: news.map((r) => ({ id: r.id, title: r.title, postedAt: iso(r.posted_at), total: r.total, read: Math.min(r.read, r.total) })),
      reminders: Object.fromEntries(CHANNELS.map((c) => [c, reminders.find((r) => r.channel === c)?.n ?? 0])) as Record<Channel, number>,
      behind: behind[0]?.n ?? 0,
    },
  };
}
