import type { StaffRole } from "../auth/session";
import type { Queryable } from "../db/types";

export type RoleChange = { ok: true } | { ok: false; reason: "last_admin" | "not_found" };

/**
 * Makes a member of staff an admin or a coach (run as the admin making the change, so RLS applies).
 * The club always keeps at least one admin, so the last admin can't be made a coach, themselves included.
 * Either way their ticked age groups are cleared: an admin sees every group anyway, and a new coach starts
 * on every group until an admin ticks theirs on the Staff screen.
 */
export async function changeStaffRole(tx: Queryable, staffId: string, role: StaffRole): Promise<RoleChange> {
  // Lock the admins first, so two admins making each other coaches at once can't leave the club with none.
  await tx.query(`select id from staff where role = 'admin' for update`);
  const changed = await tx.query(
    `update staff s set role = $2::staff_role, age_groups = '{}'
      where s.id = $1 and s.role <> $2::staff_role
        and ($3::text = 'admin' or (select count(*) from staff where role = 'admin' and id <> s.id) > 0)
      returning id`,
    [staffId, role, role],
  );
  if (changed.length) return { ok: true };
  const [current] = await tx.query<{ role: StaffRole }>(`select role::text as role from staff where id = $1`, [staffId]);
  if (!current) return { ok: false, reason: "not_found" };
  return current.role === role ? { ok: true } : { ok: false, reason: "last_admin" };
}
