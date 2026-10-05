import type { StaffRole } from "../auth/session";
import type { Queryable } from "../db/types";

/**
 * Locks the admin rows for the rest of the transaction. Every change that could take away an admin (a role
 * change or a removal) does this first, so two of them at once (say, two admins removing or demoting each
 * other) run one after the other and the second sees the first; the club can't be left with no admin.
 */
async function lockAdmins(tx: Queryable): Promise<void> {
  await tx.query(`select id from staff where role = 'admin' for update`);
}

export type RoleChange = { ok: true } | { ok: false; reason: "last_admin" | "not_found" };

/**
 * Makes a member of staff an admin or a coach (run as the admin making the change, so RLS applies).
 * The club always keeps at least one admin, so the last admin can't be made a coach, themselves included.
 * Either way their ticked age groups are cleared: an admin sees every group anyway, and a new coach starts
 * on every group until an admin ticks theirs on the Staff screen.
 */
export async function changeStaffRole(tx: Queryable, staffId: string, role: StaffRole): Promise<RoleChange> {
  await lockAdmins(tx);
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

/** Takes someone off the staff list (run as the admin doing it). Never the last admin. */
export async function removeStaffMember(tx: Queryable, staffId: string): Promise<{ ok: true } | { ok: false; reason: "last_admin" | "not_found" }> {
  await lockAdmins(tx);
  const removed = await tx.query(
    `delete from staff s where s.id = $1 and (s.role <> 'admin' or (select count(*) from staff where role = 'admin' and id <> s.id) > 0) returning id`,
    [staffId],
  );
  if (removed.length) return { ok: true };
  const [current] = await tx.query(`select id from staff where id = $1`, [staffId]);
  return { ok: false, reason: current ? "last_admin" : "not_found" };
}
