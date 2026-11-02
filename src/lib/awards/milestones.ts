import { inQuietHours } from "../chase/ladder";
import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { NO_AWARDS_GROUPS, REWARD_POINTS } from "../domain";
import type { Email, EmailReport } from "../email/send";
import { pointsRewardAdminEmail, pointsRewardParentEmail } from "../email/templates";
import { shortName } from "../admin/news-audience";

// The 20-point reward (the owner's voice note, 2 Nov 2026): once a child's points reach 20, the admins are told so
// the owner can give a reward (a certificate, a trophy, a goodie bag) and the parents are told it's coming. Once per
// child. Groups without points (U15) never reach it.

export type MilestoneSenders = {
  /** Who has an app notification turned on. */
  pushUsers: (tx: Queryable) => Promise<Set<string>>;
  /** Sends each user their own notification; returns the users reached. Missing: not set up. */
  push?: (tx: Queryable, payloads: Map<string, { title: string; body: string; url: string }>) => Promise<Set<string>>;
  /** Missing: email isn't set up. */
  email?: (emails: Email[]) => Promise<EmailReport>;
  appUrl: string | null;
};

/** Notices older than this are left alone (a retry for a few days, never old news). */
const TELL_FOR_DAYS = 7;

/** Records the milestone for every child (or the ones given) now on 20 points or more. Returns who just reached it. */
export async function recordMilestones(tx: Queryable, now: Date, playerIds?: string[]): Promise<string[]> {
  const rows = await tx.query<{ player_id: string }>(
    `insert into points_milestones (player_id, points, reached_at)
     select a.player_id, $1::int, $2::timestamptz from player_awards a join players p on p.id = a.player_id
     where p.age_group::text <> all ($3::text[]) and ($4::uuid[] is null or a.player_id = any ($4::uuid[]))
     group by a.player_id having sum(a.points) >= $1::int
     on conflict do nothing
     returning player_id`,
    [REWARD_POINTS, now, [...NO_AWARDS_GROUPS], playerIds ?? null],
  );
  return rows.map((r) => r.player_id);
}

type Person = { key: string; userId: string | null; email: string | null; firstName: string };

/** Push where the person has notifications on, else email. Returns the keys of the people reached. */
async function tell(
  tx: Queryable,
  people: Person[],
  withPush: Set<string>,
  senders: MilestoneSenders,
  message: { title: string; body: string; url: string },
  email: (p: Person, link: string) => Email,
): Promise<Set<string>> {
  const reached = new Set<string>();
  const byPush = people.filter((p) => p.userId && withPush.has(p.userId));
  if (senders.push && byPush.length) {
    const got = await senders.push(tx, new Map(byPush.map((p) => [p.userId!, message])));
    for (const p of byPush) if (got.has(p.userId!)) reached.add(p.key);
  }
  const byEmail = people.filter((p) => !reached.has(p.key) && !(p.userId && withPush.has(p.userId)) && p.email);
  if (senders.email && senders.appUrl && byEmail.length) {
    const emails = byEmail.map((p) => ({ person: p, email: email(p, `${senders.appUrl}${message.url}`) }));
    const report = await senders.email(emails.map((e) => e.email));
    const went = new Set(report.sent);
    for (const e of emails) if (went.has(e.email)) reached.add(e.person.key);
  }
  return reached;
}

/**
 * Records new milestones, then tells the admins and the parents about any not told yet (within a week of reaching
 * it). Never in quiet hours (21:00–08:00 London): the next hourly run after 8am sends it. Each side is marked only
 * once someone on it was reached, so a failed send goes again next hour.
 */
export async function sendMilestoneNotices(tx: Queryable, now: Date, senders: MilestoneSenders): Promise<{ reached: number; admins: number; parents: number }> {
  const result = { reached: (await recordMilestones(tx, now)).length, admins: 0, parents: 0 };
  if (inQuietHours(now)) return result;
  const due = await tx.query<{ player_id: string; points: number; first_name: string; last_name: string; age_group: string; admins: boolean; parents: boolean }>(
    `select m.player_id, m.points, p.first_name, p.last_name, p.age_group::text as age_group,
       m.admins_told_at is null as admins, m.parents_told_at is null as parents
     from points_milestones m join players p on p.id = m.player_id
     where (m.admins_told_at is null or m.parents_told_at is null) and m.reached_at > $1::timestamptz - make_interval(days => $2)
     order by m.reached_at limit 50`,
    [now, TELL_FOR_DAYS],
  );
  if (due.length === 0) return result;
  const withPush = senders.push ? await senders.pushUsers(tx) : new Set<string>();
  const admins = (
    await tx.query<{ id: string; auth_user_id: string | null; email: string; display_name: string }>(
      `select id, auth_user_id, email, display_name from staff where role = 'admin' order by created_at`,
    )
  ).map((a): Person => ({ key: a.id, userId: a.auth_user_id, email: a.email, firstName: a.display_name }));

  for (const m of due) {
    const child = shortName(m.first_name, m.last_name);
    if (m.admins && admins.length) {
      const got = await tell(
        tx,
        admins,
        withPush,
        senders,
        { title: `${child} (${m.age_group}) has reached ${m.points} points`, body: "Time for a reward. Tick it off on Rewards once it's given.", url: "/coach/awards/rewards" },
        (p, link) => ({
          ...pointsRewardAdminEmail({ to: p.email!, child, group: m.age_group, points: m.points, link, appUrl: senders.appUrl }),
          idempotencyKey: `points-reward:${m.player_id}:${m.points}:${p.key}`,
        }),
      );
      if (got.size) {
        await tx.query(`update points_milestones set admins_told_at = $3 where player_id = $1 and points = $2`, [m.player_id, m.points, now]);
        result.admins++;
      }
    }
    if (m.parents) {
      const parents = (
        await tx.query<{ id: string; auth_user_id: string | null; email: string | null; first_name: string }>(
          `select g.id, g.auth_user_id, g.email, g.first_name from player_guardians pg join guardians g on g.id = pg.guardian_id
           where pg.player_id = $1 order by g.created_at`,
          [m.player_id],
        )
      ).map((g): Person => ({ key: g.id, userId: g.auth_user_id, email: g.email, firstName: g.first_name }));
      const got = await tell(
        tx,
        parents,
        withPush,
        senders,
        {
          title: `Masha'Allah, ${m.first_name} has reached ${m.points} points`,
          body: `The club will give ${m.first_name} a reward to say well done.`,
          url: `/player?child=${m.player_id}`,
        },
        (p, link) => ({
          ...pointsRewardParentEmail({ to: p.email!, firstName: p.firstName, childFirstName: m.first_name, points: m.points, link, appUrl: senders.appUrl }),
          idempotencyKey: `points-reward:${m.player_id}:${m.points}:${p.key}`,
        }),
      );
      if (got.size) {
        await tx.query(`update points_milestones set parents_told_at = $3 where player_id = $1 and points = $2`, [m.player_id, m.points, now]);
        result.parents++;
      }
    }
  }
  return result;
}

// The admins' Rewards page ---------------------------------------------------------------------------------------

export type RewardRow = { playerId: string; name: string; group: string; points: number; reachedAt: string; rewardedAt: string | null; rewardedBy: string | null };
export type BadgeCandidate = { playerId: string; name: string; group: string; count: number };
export type Rewards = {
  toReward: RewardRow[];
  rewarded: RewardRow[];
  /** Children who've earned an admin-given badge by the register and don't have it yet. */
  badges: { id: string; name: string; icon: string; rule: string; candidates: BadgeCandidate[] }[];
};

/** Admin-given badges and how the register earns them: sessions attended, or sessions checked in by the start. */
const BADGE_COUNTS: Record<string, { need: number; rule: string; on_time: boolean }> = {
  "ten-sessions": { need: 10, rule: "Came to 10 sessions or more.", on_time: false },
  "on-time-5": { need: 5, rule: "Checked in by the start time at 5 sessions or more.", on_time: true },
};

export async function loadRewards(tx: Queryable): Promise<Rewards> {
  type Row = { player_id: string; first_name: string; last_name: string; age_group: string; points: number; reached_at: Date; rewarded_at: Date | null; rewarded_by: string | null; total: number };
  const rows = await tx.query<Row>(
    `select m.player_id, p.first_name, p.last_name, p.age_group::text as age_group, m.points, m.reached_at, m.rewarded_at, sn.display_name as rewarded_by,
       (select coalesce(sum(a.points), 0)::int from player_awards a where a.player_id = m.player_id) as total
     from points_milestones m join players p on p.id = m.player_id left join staff_names sn on sn.id = m.rewarded_by
     where m.rewarded_at is null or m.rewarded_at > now() - interval '60 days'
     order by m.reached_at`,
  );
  const toRow = (r: Row): RewardRow => ({
    playerId: r.player_id,
    name: `${r.first_name} ${r.last_name}`,
    group: r.age_group,
    points: r.total,
    reachedAt: iso(r.reached_at),
    rewardedAt: r.rewarded_at ? iso(r.rewarded_at) : null,
    rewardedBy: r.rewarded_by,
  });
  const badges = await tx.query<{ id: string; name: string; icon: string }>(`select id, name, icon from badges where given_by = 'admin' and not retired order by sort, name`);
  const withCandidates = await Promise.all(
    badges.map(async (b) => {
      const rule = BADGE_COUNTS[b.id];
      if (!rule) return { ...b, rule: "", candidates: [] };
      const found = await tx.query<{ id: string; first_name: string; last_name: string; age_group: string; n: number }>(
        `select p.id, p.first_name, p.last_name, p.age_group::text as age_group, count(*)::int as n
         from attendance a join players p on p.id = a.player_id join sessions s on s.id = a.session_id
         where p.age_group::text <> all ($2::text[]) and ($3::boolean = false or a.checked_in_at <= s.starts_at)
           and not exists (select 1 from player_badges pb where pb.player_id = p.id and pb.badge_id = $1)
         group by p.id having count(*) >= $4::int
         order by p.age_group, p.first_name, p.last_name`,
        [b.id, [...NO_AWARDS_GROUPS], rule.on_time, rule.need],
      );
      return { ...b, rule: rule.rule, candidates: found.map((c) => ({ playerId: c.id, name: `${c.first_name} ${c.last_name}`, group: c.age_group, count: c.n })) };
    }),
  );
  return { toReward: rows.filter((r) => !r.rewarded_at).map(toRow), rewarded: rows.filter((r) => r.rewarded_at).map(toRow).reverse(), badges: withCandidates };
}

/** How many children are waiting for their reward (the overview's Needs you). */
export async function countToReward(tx: Queryable): Promise<number> {
  const [row] = await tx.query<{ n: number }>(`select count(*)::int as n from points_milestones where rewarded_at is null`);
  return row.n;
}

/** Marks the reward given (or not, to undo a slip). Admins only, by row level security. */
export async function markRewarded(tx: Queryable, playerId: string, staffId: string, given: boolean): Promise<boolean> {
  const rows = await tx.query(
    given
      ? `update points_milestones set rewarded_at = now(), rewarded_by = $2 where player_id = $1 and rewarded_at is null returning 1`
      : `update points_milestones set rewarded_at = null, rewarded_by = null where player_id = $1 and rewarded_at is not null and $2::uuid is not null returning 1`,
    [playerId, staffId],
  );
  return rows.length > 0;
}
