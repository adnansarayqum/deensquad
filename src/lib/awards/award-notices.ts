import { inQuietHours } from "../chase/ladder";
import type { Queryable } from "../db/types";
import { NO_AWARDS_GROUPS } from "../domain";
import { awardParentEmail } from "../email/templates";
import { tell, type MilestoneSenders, type Person } from "./milestones";

// Parents hear about the stars, points and badges the coaches give (UX review, 8 Nov 2026: the peak-end rule). One
// notification per child, once the coaches have finished: nothing goes until the last thing given to that child is
// SETTLE_MINUTES old, so a session's awards arrive together and an award taken back straight away is never sent.
// Push where a parent has notifications on, else email; never in quiet hours (the next run after 8am sends it).

/** How long after the last award or badge a child's notice waits, so everything from one session goes together. */
export const SETTLE_MINUTES = 15;
/** Awards older than this are never sent: a retry for a few days, never old news. */
const TELL_FOR_DAYS = 7;

export type ChildAwards = { stars: number; points: number; badges: string[]; reason: string | null };

const listWords = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** "a star, 5 points and the Great teamwork badge". */
export function awardWords(a: ChildAwards): string {
  const parts: string[] = [];
  if (a.stars === 1) parts.push("a star");
  else if (a.stars > 1) parts.push(`${a.stars} stars`);
  if (a.points === 1) parts.push("1 point");
  else if (a.points > 1) parts.push(`${a.points} points`);
  if (a.badges.length === 1) parts.push(`the ${a.badges[0]} badge`);
  else if (a.badges.length > 1) parts.push(`the ${listWords(a.badges)} badges`);
  return listWords(parts);
}

/** The notification a parent sees. The reason (the coach's words, written for the parents) is the body. */
export function awardMessage(childFirstName: string, a: ChildAwards): { title: string; body: string } {
  return {
    title: `Masha'Allah, ${childFirstName} got ${awardWords(a)}`,
    body: a.reason ? `"${a.reason}" Tap to see it.` : "Tap to see it.",
  };
}

/** Tells each child's parents what the coaches gave them. Marks what it told only once a parent was reached. */
export async function sendAwardNotices(tx: Queryable, now: Date, senders: MilestoneSenders): Promise<{ children: number; told: number }> {
  if (inQuietHours(now)) return { children: 0, told: 0 };
  type Row = { player_id: string; first_name: string; stars: number; points: number; badges: string[]; reason: string | null; latest: Date };
  const due = await tx.query<Row>(
    `with given as (
       select a.player_id, a.created_at as at, a.stars, a.points, null::text as badge, a.reason
       from player_awards a where a.parents_told_at is null and a.created_at > $1::timestamptz - make_interval(days => $3)
       union all
       select b.player_id, b.given_at, 0, 0, bd.name, null
       from player_badges b join badges bd on bd.id = b.badge_id
       where b.parents_told_at is null and b.given_at > $1::timestamptz - make_interval(days => $3)
     )
     select g.player_id, p.first_name, sum(g.stars)::int as stars, sum(g.points)::int as points,
       coalesce(array_agg(g.badge order by g.at) filter (where g.badge is not null), '{}') as badges,
       (array_agg(g.reason order by g.at desc) filter (where g.reason is not null and g.reason <> ''))[1] as reason,
       max(g.at) as latest
     from given g join players p on p.id = g.player_id
     where p.approved_at is not null and p.age_group::text <> all ($4::text[])
     group by g.player_id, p.first_name
     having max(g.at) <= $1::timestamptz - make_interval(mins => $2)
     order by min(g.at) limit 100`,
    [now, SETTLE_MINUTES, TELL_FOR_DAYS, [...NO_AWARDS_GROUPS]],
  );
  if (due.length === 0) return { children: 0, told: 0 };
  const withPush = senders.push ? await senders.pushUsers(tx) : new Set<string>();
  let told = 0;
  for (const c of due) {
    const parents = (
      await tx.query<{ id: string; auth_user_id: string | null; email: string | null; first_name: string }>(
        `select g.id, g.auth_user_id, g.email, g.first_name from player_guardians pg join guardians g on g.id = pg.guardian_id
         where pg.player_id = $1 order by g.created_at`,
        [c.player_id],
      )
    ).map((g): Person => ({ key: g.id, userId: g.auth_user_id, email: g.email, firstName: g.first_name }));
    if (parents.length === 0) continue;
    const awards: ChildAwards = { stars: c.stars, points: c.points, badges: c.badges, reason: c.reason };
    const message = { ...awardMessage(c.first_name, awards), url: `/player?child=${c.player_id}` };
    // Keyed by the newest thing given: a retry never emails twice, and a later award gets its own email.
    const moment = new Date(c.latest).toISOString();
    const got = await tell(tx, parents, withPush, senders, message, (p, link) => ({
      ...awardParentEmail({ to: p.email!, firstName: p.firstName, childFirstName: c.first_name, awards: awardWords(awards), reason: c.reason, link, appUrl: senders.appUrl }),
      idempotencyKey: `awards:${c.player_id}:${moment}:${p.key}`,
    }));
    if (got.size === 0) continue;
    // Only what was in this notice: anything given since the query started waits for its own.
    await tx.query(
      `update player_awards set parents_told_at = $2 where player_id = $1 and parents_told_at is null and created_at <= $3::timestamptz - make_interval(mins => $4)`,
      [c.player_id, now, now, SETTLE_MINUTES],
    );
    await tx.query(
      `update player_badges set parents_told_at = $2 where player_id = $1 and parents_told_at is null and given_at <= $3::timestamptz - make_interval(mins => $4)`,
      [c.player_id, now, now, SETTLE_MINUTES],
    );
    told++;
  }
  return { children: due.length, told };
}
