import type { Queryable } from "../db/types";
import { iso } from "../db/types";
import type { AgeGroup } from "../domain";
import type { FileRef } from "../files";

// Session plans and home practice sheets. Read as the signed-in person (row level security on):
// families see their own groups', staff see everything.

export type SessionPlan = {
  id: string;
  sessionId: string;
  ageGroup: AgeGroup;
  body: string | null;
  file: FileRef | null;
  from: string | null;
  updatedAt: string;
};

type PlanRow = {
  id: string;
  session_id: string;
  age_group: AgeGroup;
  body: string | null;
  file_id: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  author: string | null;
  updated_at: Date;
};

const fileOf = (r: { file_id: string | null; file_name: string | null; file_mime: string | null; file_size: number | null }): FileRef | null =>
  r.file_id ? { id: r.file_id, name: r.file_name ?? "attachment", mime: r.file_mime ?? "application/pdf", size: r.file_size ?? 0 } : null;

const PLAN_SQL = `select sp.id, sp.session_id, sp.age_group::text as age_group, sp.body, sp.file_id,
    f.name as file_name, f.mime as file_mime, f.size as file_size, sn.display_name as author, sp.updated_at
  from session_plans sp
  left join club_files f on f.id = sp.file_id
  left join staff_names sn on sn.id = sp.author`;

const toPlan = (r: PlanRow): SessionPlan => ({
  id: r.id,
  sessionId: r.session_id,
  ageGroup: r.age_group,
  body: r.body,
  file: fileOf(r),
  from: r.author,
  updatedAt: iso(r.updated_at),
});

/** Plans for these sessions, limited to these groups (a family's, or a coach's). */
export async function loadPlans(tx: Queryable, sessionIds: string[], groups: readonly AgeGroup[]): Promise<SessionPlan[]> {
  if (sessionIds.length === 0 || groups.length === 0) return [];
  const rows = await tx.query<PlanRow>(
    `${PLAN_SQL} where sp.session_id = any ($1::uuid[]) and sp.age_group::text = any ($2::text[]) order by sp.age_group`,
    [sessionIds, [...groups]],
  );
  return rows.map(toPlan);
}

export async function loadPlan(tx: Queryable, sessionId: string, group: AgeGroup): Promise<SessionPlan | null> {
  const [row] = await tx.query<PlanRow>(`${PLAN_SQL} where sp.session_id = $1 and sp.age_group = $2::age_group`, [sessionId, group]);
  return row ? toPlan(row) : null;
}

export type PracticeSheet = {
  id: string;
  title: string;
  body: string | null;
  ageGroups: AgeGroup[];
  file: FileRef | null;
  from: string | null;
  postedById: string | null;
  createdAt: string;
};

/** Sheets for any of these groups (and those for everyone), newest first. */
export async function loadPracticeSheets(tx: Queryable, groups: readonly AgeGroup[], limit = 50): Promise<PracticeSheet[]> {
  const rows = await tx.query<{
    id: string;
    title: string;
    body: string | null;
    age_groups: AgeGroup[];
    file_id: string | null;
    file_name: string | null;
    file_mime: string | null;
    file_size: number | null;
    author: string | null;
    posted_by: string | null;
    created_at: Date;
  }>(
    `select ps.id, ps.title, ps.body, ps.age_groups::text[] as age_groups, ps.file_id, f.name as file_name, f.mime as file_mime, f.size as file_size,
       sn.display_name as author, ps.posted_by, ps.created_at
     from practice_sheets ps
     left join club_files f on f.id = ps.file_id
     left join staff_names sn on sn.id = ps.posted_by
     where cardinality(ps.age_groups) = 0 or ps.age_groups::text[] && $1::text[]
     order by ps.created_at desc limit $2`,
    [[...groups], limit],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    ageGroups: r.age_groups ?? [],
    file: fileOf(r),
    from: r.author,
    postedById: r.posted_by,
    createdAt: iso(r.created_at),
  }));
}
