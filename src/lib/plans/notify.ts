import type { Queryable } from "../db/types";
import { inQuietHours } from "../chase/ladder";

// Tells parents, by app notification, about a new session plan or practice sheet for their child's group.
// Each is announced once. Overnight ones wait for the hourly job after 8am.

export type Push = (tx: Queryable, userIds: string[], payload: { title: string; body: string; url: string }) => Promise<unknown>;

/** Parents of children in `groups` (null = every group); for a tournament squad session, only the squad's. */
async function parentsOf(tx: Queryable, groups: string[] | null, sessionId: string | null = null): Promise<string[]> {
  const rows = await tx.query<{ user_id: string }>(
    `select distinct g.auth_user_id as user_id
     from guardians g join player_guardians pg on pg.guardian_id = g.id join players p on p.id = pg.player_id
     where g.auth_user_id is not null and ($1::text[] is null or p.age_group::text = any ($1::text[]))
       and ($2::uuid is null or squad_allows($2::uuid, p.id))`,
    [groups, sessionId],
  );
  return rows.map((r) => r.user_id);
}

/** Runs without row level security (asSystem). Returns how many plans and sheets were announced. */
export async function notifyPending(tx: Queryable, now: Date, push: Push): Promise<{ plans: number; sheets: number }> {
  if (inQuietHours(now)) return { plans: 0, sheets: 0 };
  const plans = await tx.query<{ id: string; session_id: string; age_group: string; author: string | null; day: string }>(
    `update session_plans sp set notified_at = $1
     from sessions s
     where s.id = sp.session_id and sp.notified_at is null and s.starts_at > $1 and s.cancelled_at is null
     returning sp.id, sp.session_id, sp.age_group::text as age_group,
       (select display_name from staff where id = sp.author) as author,
       to_char(s.starts_at at time zone 'Europe/London', 'FMDay') as day`,
    [now],
  );
  for (const p of plans) {
    await push(tx, await parentsOf(tx, [p.age_group], p.session_id), {
      title: `${p.age_group} session plan for ${p.day}`,
      body: `${p.author ?? "The coach"} has shared what the ${p.age_group}s will work on.`,
      url: "/friday",
    });
  }
  const sheets = await tx.query<{ id: string; title: string; age_groups: string[] }>(
    `update practice_sheets set notified_at = $1
     where notified_at is null and created_at > $1::timestamptz - interval '3 days'
     returning id, title, age_groups::text[] as age_groups`,
    [now],
  );
  for (const s of sheets) {
    await push(tx, await parentsOf(tx, s.age_groups.length ? s.age_groups : null), { title: "Practise at home", body: s.title, url: "/practice" });
  }
  return { plans: plans.length, sheets: sheets.length };
}
