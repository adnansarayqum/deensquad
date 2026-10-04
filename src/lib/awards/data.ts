import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import type { AgeGroup } from "../domain";

// Points and stars. Read as the signed-in person (row level security on): families see their own
// children's awards, staff see everyone's.

export type Award = { id: string; stars: number; points: number; reason: string | null; from: string | null; fromId: string | null; givenAt: string };
export type AwardTotals = { stars: number; points: number };

type AwardRow = { id: string; stars: number; points: number; reason: string | null; author: string | null; awarded_by: string | null; created_at: Date };
const toAward = (r: AwardRow): Award => ({ id: r.id, stars: r.stars, points: r.points, reason: r.reason, from: r.author, fromId: r.awarded_by, givenAt: iso(r.created_at) });

export async function loadAwards(tx: Queryable, playerId: string, limit = 5): Promise<{ totals: AwardTotals; recent: Award[] }> {
  const [[totals], recent] = await Promise.all([
    tx.query<AwardTotals>(`select coalesce(sum(stars), 0)::int as stars, coalesce(sum(points), 0)::int as points from player_awards where player_id = $1`, [playerId]),
    tx.query<AwardRow>(
      `select a.id, a.stars, a.points, a.reason, sn.display_name as author, a.awarded_by, a.created_at
       from player_awards a left join staff_names sn on sn.id = a.awarded_by
       where a.player_id = $1 order by a.created_at desc limit $2`,
      [playerId, limit],
    ),
  ]);
  return { totals, recent: recent.map(toAward) };
}

export type SquadMember = { id: string; firstName: string; lastName: string; shirtNumber: number | null; stars: number; points: number };

/** One age group with each child's totals, highest points first. */
export async function loadSquadAwards(tx: Queryable, group: AgeGroup): Promise<SquadMember[]> {
  const rows = await tx.query<{ id: string; first_name: string; last_name: string; shirt_number: number | null; stars: number; points: number }>(
    `select p.id, p.first_name, p.last_name, p.shirt_number,
       coalesce(sum(a.stars), 0)::int as stars, coalesce(sum(a.points), 0)::int as points
     from players p left join player_awards a on a.player_id = p.id
     where p.age_group = $1::age_group
     group by p.id
     order by p.first_name, p.last_name`,
    [group],
  );
  return rows.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, shirtNumber: r.shirt_number, stars: r.stars, points: r.points }));
}
