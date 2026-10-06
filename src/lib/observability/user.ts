import type { MonitoringUser, Segment } from "./scrub";

/** Who error reports say was signed in: the opaque user id and whether they're a parent, coach or admin. Never a name or email. */
export function monitoringUser(user: { id: string; staff: { role: "admin" | "coach" } | null } | null): MonitoringUser | null {
  if (!user) return null;
  const segment: Segment = user.staff ? (user.staff.role === "admin" ? "admin" : "coach") : "parent";
  return { id: user.id, segment };
}
