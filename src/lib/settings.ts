import type { Queryable } from "./db/types";

// Club settings (migration 0026 `club_settings`): one JSON value per key, read by anyone signed in, written by admins
// only (row level security). An absent key means the default, which is always off.

/** Whether parents see their children's ratings and published progress reports (Admin: on /coach/ratings). */
export const PROGRESS_FOR_PARENTS = "progress_for_parents";

export async function progressForParents(tx: Queryable): Promise<boolean> {
  const [row] = await tx.query<{ shown: boolean }>(`select progress_visible() as shown`);
  return row?.shown === true;
}

/**
 * Switches progress for parents on or off, as the signed-in admin (a coach's write matches no policy and throws).
 * Returns the previous value, so the caller knows whether anything changed.
 */
export async function setProgressForParents(tx: Queryable, on: boolean, staffId: string): Promise<boolean> {
  const was = await progressForParents(tx);
  await tx.query(
    `insert into club_settings (key, value, updated_at, updated_by) values ($1, $2::text::jsonb, now(), $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [PROGRESS_FOR_PARENTS, JSON.stringify(on), staffId],
  );
  return was;
}
