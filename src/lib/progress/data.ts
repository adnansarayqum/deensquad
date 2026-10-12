import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import { AGE_GROUPS, isAgeGroup, type AgeGroup } from "../domain";
import { sessionIsFor } from "../squads/sql";
import { CATEGORIES, CATEGORY_KEYS, REPORT_MAX, firstOfMonth, summariseRatings, type ProgressSummary, type RatingRow, type Scores } from "./ratings";

// Player ratings and progress reports (migration 0026). Read and written as the signed-in person: staff see and
// write everyone's under row level security, so coach scope (own groups only) is checked here, as for points and
// stars. Parents read their own children's only while progress is switched on (the policies call progress_visible()).

const LONDON_DAY = `(s.starts_at at time zone 'Europe/London')::date`;
const COLS = CATEGORY_KEYS.join(", ");

/** How far back a session can still be rated from /coach/ratings. */
export const RATE_DAYS = 14;

export type RateSession = { id: string; title: string; startsAt: string; groups: AgeGroup[] };

/**
 * Sessions staff can rate: not cancelled, on a London day from `RATE_DAYS` ago up to today, for one of `groups`.
 * Newest first. `groups` lists only the session's groups this member of staff covers.
 */
export async function loadRateSessions(tx: Queryable, now: Date, groups: readonly AgeGroup[]): Promise<RateSession[]> {
  const rows = await tx.query<{ id: string; title: string; starts_at: Date; age_groups: string[] }>(
    `select s.id, s.title, s.starts_at, s.age_groups::text[] as age_groups from sessions s
     where s.cancelled_at is null and s.age_groups && $2::text[]::age_group[]
       and ${LONDON_DAY} <= ($1::timestamptz at time zone 'Europe/London')::date
       and ${LONDON_DAY} > ($1::timestamptz at time zone 'Europe/London')::date - $3::int
     order by s.starts_at desc, s.title`,
    [now, groups, RATE_DAYS],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: iso(r.starts_at),
    groups: AGE_GROUPS.filter((g) => r.age_groups.includes(g) && groups.includes(g)),
  }));
}

export type RateRow = { id: string; firstName: string; lastInitial: string; photoId: string | null; here: boolean; mine: Scores | null };

/**
 * The children of one group a session is for (its squad when it has one), checked-in first, each with this member of
 * staff's own rating for the session if they've given one.
 */
export async function loadRateRows(tx: Queryable, sessionId: string, group: AgeGroup, staffId: string): Promise<RateRow[]> {
  const rows = await tx.query<
    { id: string; first_name: string; last_name: string; photo_file_id: string | null; here: boolean; rated: boolean } & Record<string, number | null>
  >(
    `select p.id, p.first_name, p.last_name, p.photo_file_id, a.player_id is not null as here, r.id is not null as rated,
       ${CATEGORY_KEYS.map((k) => `r.${k}`).join(", ")}
     from sessions s join players p on p.age_group::text = $2 and ${sessionIsFor("s", "p")}
     left join attendance a on a.session_id = s.id and a.player_id = p.id
     left join player_ratings r on r.session_id = s.id and r.player_id = p.id and r.rated_by = $3
     where s.id = $1
     order by (a.player_id is null), p.first_name, p.last_name`,
    [sessionId, group, staffId],
  );
  return rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastInitial: r.last_name.slice(0, 1),
    photoId: r.photo_file_id,
    here: r.here,
    mine: r.rated ? (Object.fromEntries(CATEGORY_KEYS.map((k) => [k, Number(r[k])])) as Scores) : null,
  }));
}

export type RatingInput = { playerId: string; scores: Scores };

/**
 * Saves a page of ratings for one session as this member of staff (re-rating a child for the same session replaces
 * their earlier rating). Refuses, saving nothing, a session that is cancelled, in the future or unknown, and any child
 * outside `groups` (a coach's own groups) or not in the session. Returns how many were saved or the refusal.
 */
export async function saveSessionRatings(
  tx: Queryable,
  opts: { sessionId: string; staffId: string; groups: readonly AgeGroup[]; now: Date; ratings: RatingInput[] },
): Promise<{ saved: number } | { error: string }> {
  const { sessionId, staffId, groups, now, ratings } = opts;
  const [session] = await tx.query<{ ok: boolean; day: string }>(
    `select s.cancelled_at is null and ${LONDON_DAY} <= ($2::timestamptz at time zone 'Europe/London')::date as ok, ${LONDON_DAY}::text as day
     from sessions s where s.id = $1`,
    [sessionId, now],
  );
  if (!session) return { error: "That session isn't there any more. Reload and try again." };
  if (!session.ok) return { error: "You can rate a session on its day or after, and not once it's cancelled." };
  if (ratings.length === 0) return { saved: 0 };
  const ids = ratings.map((r) => r.playerId);
  const allowed = await tx.query<{ id: string; first_name: string; age_group: string; in_session: boolean }>(
    `select p.id, p.first_name, p.age_group::text as age_group, ${sessionIsFor("s", "p")} as in_session
     from players p join sessions s on s.id = $2 where p.id = any ($1::uuid[])`,
    [ids, sessionId],
  );
  const byId = new Map(allowed.map((p) => [p.id, p]));
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) return { error: "One of the children isn't at the club any more. Reload and try again." };
    if (!isAgeGroup(p.age_group) || !groups.includes(p.age_group)) return { error: `You can rate children in your own groups only. ${p.first_name} isn't in them.` };
    if (!p.in_session) return { error: `${p.first_name} isn't in this session.` };
  }
  for (const r of ratings) {
    await tx.query(
      `insert into player_ratings (player_id, session_id, rated_on, rated_by, ${COLS})
       values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)
       on conflict (player_id, session_id, rated_by) where session_id is not null
       do update set ${CATEGORY_KEYS.map((k) => `${k} = excluded.${k}`).join(", ")}, created_at = now()`,
      [r.playerId, sessionId, session.day, staffId, ...CATEGORY_KEYS.map((k) => r.scores[k])],
    );
  }
  return { saved: ratings.length };
}

/** A child's ratings over the last 6 months (both pentagon periods), each with who gave it. RLS decides who may see. */
export async function loadPlayerRatings(tx: Queryable, playerId: string, today: string): Promise<RatingRow[]> {
  const rows = await tx.query<{ rated_on: string; by: string | null } & Record<string, number>>(
    `select r.rated_on::text as rated_on, sn.display_name as by, ${CATEGORY_KEYS.map((k) => `r.${k}`).join(", ")}
     from player_ratings r left join staff_names sn on sn.id = r.rated_by
     where r.player_id = $1 and r.rated_on > $2::date - interval '6 months' and r.rated_on <= $2::date
     order by r.rated_on, r.created_at`,
    [playerId, today],
  );
  return rows.map((r) => ({ ratedOn: r.rated_on, by: r.by, ...(Object.fromEntries(CATEGORY_KEYS.map((k) => [k, Number(r[k])])) as Scores) }));
}

export async function loadProgress(tx: Queryable, playerId: string, today: string): Promise<ProgressSummary> {
  return summariseRatings(await loadPlayerRatings(tx, playerId, today), today);
}

export type GroupAverage = { group: AgeGroup; count: number; children: number; scores: Scores };

/** Each of `groups`' average per category this London month (staff only; never shown to parents). Groups with none are left out. */
export async function loadGroupAverages(tx: Queryable, groups: readonly AgeGroup[], today: string): Promise<GroupAverage[]> {
  const rows = await tx.query<{ age_group: string; count: number; children: number } & Record<string, string | number>>(
    `select p.age_group::text as age_group, count(*)::int as count, count(distinct r.player_id)::int as children,
       ${CATEGORY_KEYS.map((k) => `avg(r.${k})::float8 as ${k}`).join(", ")}
     from player_ratings r join players p on p.id = r.player_id
     where p.age_group::text = any ($1::text[]) and r.rated_on >= $2::date and r.rated_on <= $3::date
     group by p.age_group`,
    [groups, firstOfMonth(today), today],
  );
  return AGE_GROUPS.flatMap((g) => {
    const r = rows.find((x) => x.age_group === g);
    if (!r) return [];
    return [{ group: g, count: r.count, children: r.children, scores: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, Number(r[k])])) as Scores }];
  });
}

export type ProgressReport = { id: string; month: string; body: string; by: string | null; publishedAt: string | null; updatedAt: string };

type ReportRow = { id: string; month: string; body: string; by: string | null; published_at: Date | null; updated_at: Date };
const toReport = (r: ReportRow): ProgressReport => ({
  id: r.id,
  month: r.month,
  body: r.body,
  by: r.by,
  publishedAt: r.published_at ? iso(r.published_at) : null,
  updatedAt: iso(r.updated_at),
});

/** A child's reports, newest month first. `published` keeps only published ones (what a parent can be shown). */
export async function loadReports(tx: Queryable, playerId: string, opts: { published?: boolean; limit?: number } = {}): Promise<ProgressReport[]> {
  const rows = await tx.query<ReportRow>(
    `select r.id, r.month::text as month, r.body, sn.display_name as by, r.published_at, r.updated_at
     from progress_reports r left join staff_names sn on sn.id = r.written_by
     where r.player_id = $1 and ($2::boolean is not true or r.published_at is not null)
     order by r.month desc limit $3`,
    [playerId, opts.published ?? false, opts.limit ?? 24],
  );
  return rows.map(toReport);
}

export async function loadReport(tx: Queryable, playerId: string, month: string): Promise<ProgressReport | null> {
  const [row] = await tx.query<ReportRow>(
    `select r.id, r.month::text as month, r.body, sn.display_name as by, r.published_at, r.updated_at
     from progress_reports r left join staff_names sn on sn.id = r.written_by where r.player_id = $1 and r.month = $2::date`,
    [playerId, month],
  );
  return row ? toReport(row) : null;
}

/**
 * Saves a child's report for a month as a draft (`publish` false: hidden from parents, even if it was published) or
 * published (keeping its first publish time). Returns whether the parents should now be emailed: published, never
 * emailed before, and progress is switched on for parents. Marks it emailed in the same statement, so a second tap
 * can't email twice; a report published while progress is off is never emailed later (no backlog on switching on).
 */
export async function saveReport(
  tx: Queryable,
  opts: { playerId: string; month: string; body: string; staffId: string; publish: boolean },
): Promise<{ id: string; email: boolean }> {
  const { playerId, month, body, staffId, publish } = opts;
  if (body.length === 0 || body.length > REPORT_MAX) throw new Error("report body out of range");
  const [row] = await tx.query<{ id: string; email: boolean }>(
    `with visible as (select progress_visible() as shown)
     insert into progress_reports as r (player_id, month, body, written_by, published_at, emailed_at, updated_at)
     select $1, $2::date, $3, $4, case when $5::boolean then now() end, case when $5::boolean and v.shown then now() end, now() from visible v
     on conflict (player_id, month) do update set
       body = excluded.body, written_by = excluded.written_by, updated_at = now(),
       published_at = case when $5::boolean then coalesce(r.published_at, now()) end,
       emailed_at = case when $5::boolean and (select shown from visible) then coalesce(r.emailed_at, now()) else r.emailed_at end
     returning r.id, ($5::boolean and (select shown from visible) and r.emailed_at = r.updated_at) as email`,
    [playerId, month, body, staffId, publish],
  );
  return { id: row.id, email: row.email === true };
}

/** For the AI draft: what happened this month for one child (counts and the coaches' own notes; no other children). */
export type MonthFacts = {
  sessions: number;
  attended: number;
  points: number;
  stars: number;
  badges: string[];
  notes: string[];
};

export async function loadMonthFacts(tx: Queryable, playerId: string, month: string, today: string): Promise<MonthFacts> {
  const end = `least(($2::date + interval '1 month')::date, $3::date + 1)`;
  const [[att], [awards], badges, notes] = await Promise.all([
    tx.query<{ sessions: number; attended: number }>(
      `select count(*)::int as sessions, count(a.player_id)::int as attended
       from sessions s join players p on p.id = $1
       left join attendance a on a.session_id = s.id and a.player_id = p.id
       where s.cancelled_at is null and ${sessionIsFor("s", "p")}
         and ${LONDON_DAY} >= $2::date and ${LONDON_DAY} < ${end} and s.starts_at <= now()`,
      [playerId, month, today],
    ),
    tx.query<{ points: number; stars: number }>(
      `select coalesce(sum(points), 0)::int as points, coalesce(sum(stars), 0)::int as stars from player_awards
       where player_id = $1 and (created_at at time zone 'Europe/London')::date >= $2::date and (created_at at time zone 'Europe/London')::date < ${end}`,
      [playerId, month, today],
    ),
    tx.query<{ name: string }>(
      `select b.name from player_badges pb join badges b on b.id = pb.badge_id
       where pb.player_id = $1 and pb.earned_on >= $2::date and pb.earned_on < ${end} order by pb.earned_on`,
      [playerId, month, today],
    ),
    tx.query<{ body: string }>(
      `select body from coach_notes where player_id = $1
         and (created_at at time zone 'Europe/London')::date >= $2::date and (created_at at time zone 'Europe/London')::date < ${end}
       order by created_at limit 5`,
      [playerId, month, today],
    ),
  ]);
  return { sessions: att.sessions, attended: att.attended, points: awards.points, stars: awards.stars, badges: badges.map((b) => b.name), notes: notes.map((n) => n.body) };
}

export { CATEGORIES };
