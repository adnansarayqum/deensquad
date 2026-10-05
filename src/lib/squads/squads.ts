import type { Queryable } from "../db/types";
import { AGE_GROUPS, type AgeGroup, type Availability, type Session } from "../domain";
import { within } from "../admin/scope";
import { SESSION_COLUMNS, toSession, type SessionRow } from "../parent/data";

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
  picked: boolean;
  /** The family's answer: coming = confirmed, away = can't play. */
  answer: Availability | null;
};

export type SquadView = { session: Session; children: SquadChild[]; picked: number };

/** Whether this member of staff may pick the squad for a session with these groups. */
export function canManageSquad(sessionGroups: readonly string[], mine: readonly AgeGroup[] | null): boolean {
  return !mine || within(sessionGroups, mine);
}

/** The session and every child in its age groups (picked or not), or null when it isn't there or isn't theirs. */
export async function loadSquad(tx: Queryable, sessionId: string, mine: readonly AgeGroup[] | null): Promise<SquadView | null> {
  const [row] = await tx.query<SessionRow>(`select ${SESSION_COLUMNS} from sessions s where s.id = $1`, [sessionId]);
  if (!row || !canManageSquad(row.age_groups, mine)) return null;
  const session = toSession(row);
  const rows = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    shirt_number: number | null;
    picked: boolean;
    answer: Availability | null;
  }>(
    // Picked children stay listed even if they've since moved to another group, so they can be taken out.
    `select p.id, p.first_name, p.last_name, p.age_group::text as age_group, p.shirt_number,
       q.player_id is not null as picked, a.answer::text as answer
     from players p
     left join session_squads q on q.session_id = $1 and q.player_id = p.id
     left join availability a on a.session_id = $1 and a.player_id = p.id
     where p.age_group = any ($2::text[]::age_group[]) or q.player_id is not null
     order by p.first_name, p.last_name`,
    [sessionId, session.ageGroups],
  );
  const order = (g: AgeGroup) => AGE_GROUPS.indexOf(g);
  const children = rows
    .map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      ageGroup: r.age_group,
      shirtNumber: r.shirt_number,
      picked: r.picked,
      answer: r.picked ? r.answer : null,
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
