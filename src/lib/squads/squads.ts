import type { Queryable } from "../db/types";
import { AGE_GROUPS, type AgeGroup, type Availability, type Session } from "../domain";
import { within } from "../admin/scope";
import { SESSION_COLUMNS, toSession, type SessionRow } from "../parent/data";
import { seasonStart } from "../exports/reports";
import { sessionIsFor } from "./sql";

// Tournament squads: staff pick which children of a session's age groups play in it. Once anyone is picked,
// only the picked children's families see the session, answer for it ("Can Yusuf play?") and get messages
// sent to the squad. Picking nobody makes it an ordinary session for the whole groups again.
// Runs as the member of staff (row level security on: staff see the club). `mine` is a group coach's own
// groups (coachLimit; null = no limit): they manage a squad only when every group of the session is theirs.

export type SquadChild = {
  id: string;
  firstName: string;
  lastName: string;
  ageGroup: AgeGroup;
  shirtNumber: number | null;
  /** The photo a parent added for the coaches. */
  photoId: string | null;
  picked: boolean;
  /** The family's answer: coming = confirmed, away = can't play. */
  answer: Availability | null;
  /**
   * This season (from 1 August): sessions for the child that have finished, weren't cancelled and had the register
   * taken for their group (anyone from it checked in), and how many of those the child was checked in at.
   */
  season: { attended: number; held: number };
};

export type SquadView = { session: Session; children: SquadChild[]; picked: number };

/** Whether this member of staff may pick the squad for a session with these groups. */
export function canManageSquad(sessionGroups: readonly string[], mine: readonly AgeGroup[] | null): boolean {
  return !mine || within(sessionGroups, mine);
}

/** The session and every child in its age groups (picked or not), or null when it isn't there or isn't theirs. */
export async function loadSquad(
  tx: Queryable,
  sessionId: string,
  mine: readonly AgeGroup[] | null,
  now = new Date(),
): Promise<SquadView | null> {
  const [row] = await tx.query<SessionRow>(`select ${SESSION_COLUMNS} from sessions s where s.id = $1`, [sessionId]);
  if (!row || !canManageSquad(row.age_groups, mine)) return null;
  const session = toSession(row);
  const rows = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    shirt_number: number | null;
    photo_file_id: string | null;
    picked: boolean;
    answer: Availability | null;
    held: number;
    attended: number;
  }>(
    // Picked children stay listed even if they've since moved to another group, so they can be taken out.
    // Attendance: the season's finished sessions for each child since they joined (the same "register taken" and
    // joined_on rules as the dashboard).
    `with taken as (
       select s.id, s.starts_at, s.age_groups, g.age_group
       from sessions s cross join lateral unnest(s.age_groups) as g(age_group)
       where s.starts_at >= $3 and s.ends_at <= $4 and s.cancelled_at is null
         and exists (select 1 from attendance t join players tp on tp.id = t.player_id where t.session_id = s.id and tp.age_group = g.age_group)
     ),
     season as (
       select p.id, count(*)::int as held, count(t.player_id)::int as attended
       from players p
       join taken s on s.age_group = p.age_group and ${sessionIsFor("s", "p")}
       left join attendance t on t.session_id = s.id and t.player_id = p.id
       -- only sessions since the child joined (or that they came to), as on the overview
       where p.joined_on <= (s.starts_at at time zone 'Europe/London')::date or t.player_id is not null
       group by p.id
     )
     select p.id, p.first_name, p.last_name, p.age_group::text as age_group, p.shirt_number, p.photo_file_id,
       q.player_id is not null as picked, a.answer::text as answer,
       coalesce(se.held, 0) as held, coalesce(se.attended, 0) as attended
     from players p
     left join session_squads q on q.session_id = $1 and q.player_id = p.id
     left join availability a on a.session_id = $1 and a.player_id = p.id
     left join season se on se.id = p.id
     where p.age_group = any ($2::text[]::age_group[]) or q.player_id is not null
     order by p.first_name, p.last_name`,
    [sessionId, session.ageGroups, seasonStart(now), now],
  );
  const order = (g: AgeGroup) => AGE_GROUPS.indexOf(g);
  const children = rows
    .map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      ageGroup: r.age_group,
      shirtNumber: r.shirt_number,
      photoId: r.photo_file_id,
      picked: r.picked,
      answer: r.picked ? r.answer : null,
      season: { attended: r.attended, held: r.held },
    }))
    .sort((a, b) => order(a.ageGroup) - order(b.ageGroup));
  return { session, children, picked: children.filter((c) => c.picked).length };
}

export type SaveSquadResult = { ok: true; picked: number; added: number; removed: number } | { ok: false; reason: "not_found" | "not_yours" };

/**
 * Replaces the squad with `playerIds` (children outside the session's groups are ignored, unless already picked).
 * Children taken out lose their answer for the session too, so a reserve's place is clean and nothing they
 * said lingers in the counts; picking them again asks afresh. With a squad, answers from children not in it go.
 */
export async function saveSquad(
  tx: Queryable,
  sessionId: string,
  playerIds: readonly string[],
  staffId: string,
  mine: readonly AgeGroup[] | null,
): Promise<SaveSquadResult> {
  const [row] = await tx.query<{ age_groups: string[] }>(`select age_groups::text[] as age_groups from sessions where id = $1`, [sessionId]);
  if (!row) return { ok: false, reason: "not_found" };
  if (!canManageSquad(row.age_groups, mine)) return { ok: false, reason: "not_yours" };

  const wanted = await tx.query<{ id: string }>(
    `select p.id from players p
     where p.id = any ($2::uuid[])
       and (p.age_group = any ($3::text[]::age_group[]) or exists (select 1 from session_squads q where q.session_id = $1 and q.player_id = p.id))`,
    [sessionId, [...new Set(playerIds)], row.age_groups],
  );
  const ids = wanted.map((w) => w.id);
  const removed = await tx.query(
    `delete from session_squads where session_id = $1 and not (player_id = any ($2::uuid[])) returning player_id`,
    [sessionId, ids],
  );
  const added = await tx.query(
    `insert into session_squads (session_id, player_id, added_by)
     select $1, id, $3 from unnest($2::uuid[]) as id
     on conflict (session_id, player_id) do nothing returning player_id`,
    [sessionId, ids, staffId],
  );
  if (ids.length > 0) {
    await tx.query(`delete from availability where session_id = $1 and not (player_id = any ($2::uuid[]))`, [sessionId, ids]);
  }
  return { ok: true, picked: ids.length, added: added.length, removed: removed.length };
}
