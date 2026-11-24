import type { AgeGroup } from "../domain";
import type { Queryable } from "../db/types";
import { londonDate } from "../dates";

// Player of the week (migration 0057; the end-to-end verdict's "wow" feature, 24 Nov 2026): a coach picks one child
// per group each week and writes a line about them; the child's parents get a card to keep and share. A family
// reads only its own children's (row level security); staff pick within their own groups (checked by the action).

export const COMMENT_MAX = 200;

/** The Monday (London) of the week `now` falls in, as YYYY-MM-DD. */
export function weekStart(now: Date): string {
  const d = londonDate(now);
  const monday = new Date(Date.UTC(d.year, d.month - 1, d.day - ((d.weekday + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

/** "week of 23 November" from a week's Monday. */
export function weekWords(week: string): string {
  return `week of ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${week}T00:00:00Z`))}`;
}

export type Spotlight = {
  id: string;
  playerId: string;
  firstName: string;
  ageGroup: AgeGroup;
  week: string;
  comment: string;
  coach: string | null;
  photoFileId: string | null;
};

const COLUMNS = `sp.id, sp.player_id, p.first_name, sp.age_group::text as age_group, sp.week::text as week, sp.comment,
  (select sn.display_name from staff_names sn where sn.id = sp.given_by) as coach, p.photo_file_id`;

type Row = { id: string; player_id: string; first_name: string; age_group: AgeGroup; week: string; comment: string; coach: string | null; photo_file_id: string | null };

const view = (r: Row): Spotlight => ({
  id: r.id,
  playerId: r.player_id,
  firstName: r.first_name,
  ageGroup: r.age_group,
  week: r.week,
  comment: r.comment,
  coach: r.coach,
  photoFileId: r.photo_file_id,
});

/** One spotlight, if the signed-in person may read it (their own child's, or staff). */
export async function loadSpotlight(tx: Queryable, id: string): Promise<Spotlight | null> {
  const [row] = await tx.query<Row>(`select ${COLUMNS} from player_spotlights sp join players p on p.id = sp.player_id where sp.id = $1`, [id]);
  return row ? view(row) : null;
}

/** A child's spotlights, newest first. */
export async function loadChildSpotlights(tx: Queryable, playerId: string, limit = 3): Promise<Spotlight[]> {
  const rows = await tx.query<Row>(
    `select ${COLUMNS} from player_spotlights sp join players p on p.id = sp.player_id where sp.player_id = $1 order by sp.week desc limit $2`,
    [playerId, limit],
  );
  return rows.map(view);
}

/** Who holds a group's spotlight for a week (staff): the child's name, for "saving replaces Yusuf". */
export async function loadWeekSpotlight(tx: Queryable, group: AgeGroup, week: string): Promise<(Spotlight & { lastName: string }) | null> {
  const [row] = await tx.query<Row & { last_name: string }>(
    `select ${COLUMNS}, p.last_name from player_spotlights sp join players p on p.id = sp.player_id where sp.age_group::text = $1 and sp.week = $2::date`,
    [group, week],
  );
  return row ? { ...view(row), lastName: row.last_name } : null;
}

/**
 * Makes a child their group's Player of the week (replacing whoever it was this week). Run as staff; the caller has
 * checked the child is in their groups. Returns the spotlight's id, or null when the child isn't there.
 */
export async function setSpotlight(tx: Queryable, opts: { playerId: string; comment: string; staffId: string; week: string }): Promise<string | null> {
  const [row] = await tx.query<{ id: string }>(
    `insert into player_spotlights (player_id, age_group, week, comment, given_by)
     select p.id, p.age_group, $2::date, $3, $4 from players p where p.id = $1
     on conflict (week, age_group) do update
       set player_id = excluded.player_id, comment = excluded.comment, given_by = excluded.given_by, created_at = now(),
           -- the same child with new words isn't announced twice; a different child is
           parents_told_at = case when player_spotlights.player_id = excluded.player_id then player_spotlights.parents_told_at end
     returning id`,
    [opts.playerId, opts.week, opts.comment, opts.staffId],
  );
  return row?.id ?? null;
}

export async function removeSpotlight(tx: Queryable, id: string): Promise<void> {
  await tx.query(`delete from player_spotlights where id = $1`, [id]);
}
