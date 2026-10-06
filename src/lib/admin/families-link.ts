import { isAgeGroup, type AgeGroup } from "../domain";
import { isNeed, type Need } from "./needs";

// The Families list's filters (?group, ?q, ?need). A child opened from the list carries them, so
// "← Families" returns to the same list. Only these three keys are read, each checked, and the link
// is always to /admin/families, so nothing in the address can send anyone elsewhere.

export type FamiliesFilter = { group: AgeGroup | null; need: Need | null; q: string };

type Params = Record<string, string | string[] | undefined>;

/** The filters in `params`, with anything unknown dropped. `groups` limits the group to the viewer's own. */
export function familiesFilter(params: Params, groups: readonly AgeGroup[]): FamiliesFilter {
  const group = isAgeGroup(params.group) && groups.includes(params.group) ? params.group : null;
  const need = isNeed(params.need) ? params.need : null;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  return { group, need, q };
}

/** The filters as a query string without the "?", or "" when there are none. */
export function familiesQuery({ group, need, q }: FamiliesFilter): string {
  const params = new URLSearchParams();
  if (group) params.set("group", group);
  if (need) params.set("need", need);
  if (q) params.set("q", q);
  return params.toString();
}

export function familiesHref(filter: FamiliesFilter): string {
  const query = familiesQuery(filter);
  return query ? `/admin/families?${query}` : "/admin/families";
}

/** A child's page, opened from the list with these filters. */
export function familyChildHref(id: string, filter: FamiliesFilter): string {
  const query = familiesQuery(filter);
  return query ? `/admin/families/${id}?${query}` : `/admin/families/${id}`;
}
