import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { asSystem } from "../db";
import { AGE_GROUPS, isAgeGroup, type AgeGroup } from "../domain";
import { noteServerUser } from "../observability/server-user";
import { monitoringUser } from "../observability/user";
import { SESSION_COOKIE } from "./cookies";
import { linkRecords, readSession } from "./service";

export type StaffRole = "admin" | "coach";

export type CurrentUser = {
  id: string;
  email: string;
  guardian: { id: string; firstName: string } | null;
  staff: { id: string; role: StaffRole; displayName: string; ageGroups: AgeGroup[] } | null;
};

/** The age groups a member of staff works with: their own for a coach who has some, otherwise every group. */
export function staffGroups(staff: { role: StaffRole; ageGroups: AgeGroup[] }): AgeGroup[] {
  return staff.role === "coach" && staff.ageGroups.length ? AGE_GROUPS.filter((g) => staff.ageGroups.includes(g)) : [...AGE_GROUPS];
}

/** True for a coach limited to some age groups (they can't post to everyone). */
export function isGroupCoach(staff: { role: StaffRole; ageGroups: AgeGroup[] }): boolean {
  return staff.role === "coach" && staff.ageGroups.length > 0;
}

/** A group coach's own groups, or null for admins and coaches with no groups ticked (no limit). See `src/lib/admin/scope.ts`. */
export function coachLimit(staff: { role: StaffRole; ageGroups: AgeGroup[] }): AgeGroup[] | null {
  return isGroupCoach(staff) ? staffGroups(staff) : null;
}

/** The signed-in person for this request, or null. Checked against the database once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await asSystem(async (tx): Promise<CurrentUser | null> => {
    const session = await readSession(tx, token, new Date());
    if (!session) return null;
    const load = () =>
      Promise.all([
        tx.query<{ id: string; first_name: string }>(`select id, first_name from guardians where auth_user_id = $1`, [session.userId]),
        tx.query<{ id: string; role: StaffRole; display_name: string; age_groups: string[] }>(`select id, role::text as role, display_name, age_groups::text[] as age_groups from staff where auth_user_id = $1`, [
          session.userId,
        ]),
      ]);
    let [guardians, staff] = await load();
    // Someone added by the club after they first signed in (a coach who is also a parent, say).
    if (guardians.length === 0 || staff.length === 0) {
      await linkRecords(tx, session.userId, session.email);
      [guardians, staff] = await load();
    }
    return {
      id: session.userId,
      email: session.email,
      guardian: guardians[0] ? { id: guardians[0].id, firstName: guardians[0].first_name } : null,
      staff: staff[0] ? { id: staff[0].id, role: staff[0].role, displayName: staff[0].display_name, ageGroups: (staff[0].age_groups ?? []).filter(isAgeGroup) } : null,
    };
  });
  // Error reports for this request carry only the opaque id and parent/coach/admin (when Sentry is on).
  noteServerUser(monitoringUser(user));
  return user;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** A parent. Staff who aren't parents go to the admin; anyone else is told to ask the club. */
export async function requireParent(): Promise<CurrentUser & { guardian: NonNullable<CurrentUser["guardian"]> }> {
  const user = await requireUser();
  if (!user.guardian) redirect(user.staff ? "/admin" : "/sign-in/not-linked");
  return user as CurrentUser & { guardian: NonNullable<CurrentUser["guardian"]> };
}

export async function requireStaff(): Promise<CurrentUser & { staff: NonNullable<CurrentUser["staff"]> }> {
  const user = await requireUser();
  if (!user.staff) redirect(user.guardian ? "/news" : "/sign-in/not-linked");
  return user as CurrentUser & { staff: NonNullable<CurrentUser["staff"]> };
}

export async function requireAdmin(): Promise<CurrentUser & { staff: NonNullable<CurrentUser["staff"]> }> {
  const user = await requireStaff();
  if (user.staff.role !== "admin") redirect("/admin");
  return user;
}
