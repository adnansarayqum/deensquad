import type { AgeGroup } from "../domain";
import type { Queryable } from "../db/types";
import { SEASON_START_SQL } from "../admin/needs";
import { londonDate } from "../dates";
import { sessionIsFor } from "../squads/sql";

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
  shirtNumber: number | null;
  position: string | null;
};

const COLUMNS = `sp.id, sp.player_id, p.first_name, sp.age_group::text as age_group, sp.week::text as week, sp.comment,
  (select sn.display_name from staff_names sn where sn.id = sp.given_by) as coach, p.photo_file_id, p.shirt_number, p.position`;

type Row = { id: string; player_id: string; first_name: string; age_group: AgeGroup; week: string; comment: string; coach: string | null; photo_file_id: string | null; shirt_number: number | null; position: string | null };

const view = (r: Row): Spotlight => ({
  id: r.id,
  playerId: r.player_id,
  firstName: r.first_name,
  ageGroup: r.age_group,
  week: r.week,
  comment: r.comment,
  coach: r.coach,
  photoFileId: r.photo_file_id,
  shirtNumber: r.shirt_number,
  position: r.position,
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

export type CardStat = { value: string; label: string };

/**
 * The child's own season in numbers for the card (the same figures as the Family screen's player card): sessions
 * that were theirs and have finished, how many they came to, their run of sessions in a row, and points, stars and
 * badges where their group has them. Read as the signed-in person, so a family gets only its own child's.
 */
export async function loadCardStats(tx: Queryable, playerId: string, awards: boolean): Promise<CardStat[]> {
  const sessions = await tx.query<{ here: boolean }>(
    `select exists (select 1 from attendance a where a.session_id = s.id and a.player_id = p.id) as here
     from players p join sessions s on ${sessionIsFor("s", "p")}
     where p.id = $1 and s.cancelled_at is null and s.starts_at < now()
       and s.starts_at >= ${SEASON_START_SQL} and s.starts_at >= p.joined_on::timestamptz
       and (s.ends_at <= now() or exists (select 1 from attendance a where a.session_id = s.id and a.player_id = p.id))
     order by s.starts_at desc limit 200`,
    [playerId],
  );
  const came = sessions.filter((s) => s.here).length;
  const streak = sessions.findIndex((s) => !s.here);
  const stats: CardStat[] = [
    { value: String(came), label: came === 1 ? "session" : "sessions" },
    { value: sessions.length ? `${Math.round((came / sessions.length) * 100)}%` : "–", label: "attended" },
    { value: String(streak === -1 ? sessions.length : streak), label: "in a row" },
  ];
  if (!awards) return stats;
  const [totals] = await tx.query<{ points: number; stars: number; badges: number }>(
    `select coalesce((select sum(points) from player_awards where player_id = $1), 0)::int as points,
       coalesce((select sum(stars) from player_awards where player_id = $1), 0)::int as stars,
       (select count(*) from player_badges where player_id = $1)::int as badges`,
    [playerId],
  );
  return [
    ...stats,
    { value: String(totals.points), label: totals.points === 1 ? "point" : "points" },
    { value: String(totals.stars), label: totals.stars === 1 ? "star" : "stars" },
    { value: String(totals.badges), label: totals.badges === 1 ? "badge" : "badges" },
  ];
}

/** "MID" for Midfielder: the short position on the card (null when the club hasn't set one). */
export function positionShort(position: string | null): string | null {
  const p = position?.trim().toLowerCase();
  if (!p) return null;
  if (p.startsWith("goal") || p === "gk" || p === "keeper") return "GK";
  if (p.startsWith("def")) return "DEF";
  if (p.startsWith("mid")) return "MID";
  if (p.startsWith("str")) return "ST";
  if (p.startsWith("for") || p.startsWith("att") || p.startsWith("wing")) return "FWD";
  return p.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || null;
}
