import type { Queryable } from "../db/types";
import type { AgeGroup } from "../domain";
import { within } from "./scope";

// Session changes made from Admin → Sessions. `mine` is a group coach's own groups (null = no limit):
// they can change only sessions for those groups alone, so joint sessions stay with admins.

async function sessionIsMine(tx: Queryable, id: string, mine: readonly AgeGroup[] | null): Promise<boolean> {
  const [row] = await tx.query<{ age_groups: string[] }>(`select age_groups::text[] as age_groups from sessions where id = $1`, [id]);
  return Boolean(row) && (!mine || within(row.age_groups, mine));
}

/** Cancels or restores a session. False (and nothing changed) when it isn't the coach's to change. */
export async function cancelSession(tx: Queryable, id: string, cancel: boolean, mine: readonly AgeGroup[] | null): Promise<boolean> {
  if (!(await sessionIsMine(tx, id, mine))) return false;
  await tx.query(`update sessions set cancelled_at = ${cancel ? "now()" : "null"} where id = $1`, [id]);
  return true;
}

/** Deletes a session nobody has been checked in to, so attendance history is never lost. */
export async function removeSession(tx: Queryable, id: string, mine: readonly AgeGroup[] | null): Promise<boolean> {
  if (!(await sessionIsMine(tx, id, mine))) return false;
  const gone = await tx.query(`delete from sessions s where s.id = $1 and not exists (select 1 from attendance a where a.session_id = s.id) returning s.id`, [id]);
  return gone.length > 0;
}
