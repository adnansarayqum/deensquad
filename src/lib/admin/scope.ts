import type { AgeGroup } from "../domain";

// Group limits for coaches who look after some age groups (see `isGroupCoach`). They're enforced
// here in the app, not by row level security: under RLS every member of staff can read the club.
//
// `mine` is the coach's own groups. A target of null means "everyone" (news posted to every family).
// An empty array is treated the same way, as it is for practice sheets and staff.age_groups
// ("empty means every group"); the app never writes one for news, and sessions can't have one.

/** True only when every group the target covers is one of mine. "Everyone" is never within. */
export function within(target: readonly string[] | null, mine: readonly AgeGroup[]): boolean {
  if (target === null || target.length === 0) return false;
  return target.every((g) => (mine as readonly string[]).includes(g));
}

/** True when the target reaches at least one of my groups. "Everyone" always overlaps. */
export function overlaps(target: readonly string[] | null, mine: readonly AgeGroup[]): boolean {
  if (target === null || target.length === 0) return true;
  return target.some((g) => (mine as readonly string[]).includes(g));
}
