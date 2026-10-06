import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { londonDate, londonTime } from "../dates";
import { AGE_GROUPS, type AgeGroup, type PaymentState } from "../domain";
import { seasonStart } from "../exports/reports";
import { newsReaches, sessionIsFor } from "../squads/sql";
import { NEEDS, TODO_NEEDS, behindOnNews } from "./needs";

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
  /**
   * Sessions this season (from 1 August) that have finished, weren't cancelled and had at least one
   * child from this group checked in, i.e. the register was taken. Sessions where nobody from the
   * group was marked in are left out, so an unused register doesn't read as 0% attendance.
   */
  held: number;
  checkedIn: number;
  /**
   * Over those sessions, how many children were in the group on the day: those who'd joined by then
   * (players.joined_on), plus anyone checked in. Children added later (a new import) don't lower past sessions.
   */
  expected: number;
  /** Checked in ÷ expected, as a whole percentage. Null when there's nothing to divide by. */
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

export function averagePct(checkedIn: number, expected: number): number | null {
  return expected > 0 ? Math.round((checkedIn / expected) * 100) : null;
}

// A message reaches a child when it's for everyone (null or empty audience) or for the child's group,
// or, for a message to a tournament squad, when the child is in that squad.
const reaches = newsReaches("a", "p");

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
         -- for a tournament squad session, the group's picked children only
         (select count(*)::int from players p where p.age_group::text = g.grp and (s.id is null or ${sessionIsFor("s", "p")})) as squad,
         (select count(*)::int from availability v join players p on p.id = v.player_id
           where v.session_id = s.id and p.age_group::text = g.grp and v.answer = 'coming' and ${sessionIsFor("s", "p")}) as coming,
         (select count(*)::int from availability v join players p on p.id = v.player_id
           where v.session_id = s.id and p.age_group::text = g.grp and v.answer = 'away' and ${sessionIsFor("s", "p")}) as away
       from unnest($1::text[]) with ordinality as g (grp, ord)
       left join lateral (
         select s.id, s.title, s.starts_at, s.age_groups from sessions s
         where s.ends_at > $2 and s.cancelled_at is null and g.grp = any (s.age_groups::text[])
           -- a squad session counts for a group only when some of the group are picked
           and (not is_squad_session(s.id) or exists (
             select 1 from session_squads q join players qp on qp.id = q.player_id where q.session_id = s.id and qp.age_group::text = g.grp))
         order by s.starts_at, s.created_at limit 1
       ) s on true
       order by g.ord`,
      [groups, now],
    ),
    tx.query<{ group: AgeGroup; squad: number; held: number; checked_in: number; expected: number }>(
      `select g.grp as "group",
         (select count(*)::int from players p where p.age_group::text = g.grp) as squad,
         (count(s.id) filter (where c.n > 0))::int as held,
         coalesce(sum(c.n), 0)::int as checked_in,
         coalesce(sum(c.expected) filter (where c.n > 0), 0)::int as expected
       from unnest($1::text[]) with ordinality as g (grp, ord)
       left join sessions s on g.grp = any (s.age_groups::text[]) and s.starts_at >= $2 and s.ends_at <= $3 and s.cancelled_at is null
       -- each session against the group as it was that day: children who'd joined by then, and anyone checked in
       left join lateral (
         select count(a.player_id)::int as n, count(*)::int as expected
         from players p left join attendance a on a.session_id = s.id and a.player_id = p.id
         where p.age_group::text = g.grp
           and (p.joined_on <= (s.starts_at at time zone 'Europe/London')::date or a.player_id is not null)
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
    // The same rule as the Families list's "unread" filter, which this figure links to.
    tx.query<{ n: number }>(`select count(*)::int as n from guardians g where ${behindOnNews("g", "$1::text[]")}`, [groups]),
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
        expected: r.expected,
        averagePct: averagePct(r.checked_in, r.expected),
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
