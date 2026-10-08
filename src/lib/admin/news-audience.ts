// Who a news message reaches, in words, for the post form and the news list. Pure, so the post form can say it live
// as staff tick groups or children, and the server and the browser say the same.

/** At most this many children on one "Chosen children" message; more is a group message. */
export const CHOSEN_MAX = 200;

/** A child as the post form's picker lists them: `guardians` are their parents' ids, to count who a message reaches. */
export type NewsChild = { id: string; firstName: string; lastName: string; ageGroup: string; guardians: string[] };

/** "Kaizan A.": first name and last initial, as staff screens name children in lists. */
export function shortName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0);
  return initial ? `${firstName} ${initial.toUpperCase()}.` : firstName;
}

/** "3 children: Kaizan A., Musa B., +1" (at most two names; the rest as a count). */
export function chosenLabel(names: readonly string[]): string {
  const n = names.length;
  if (n === 0) return "Chosen children: none left";
  const shown = names.slice(0, 2);
  const rest = n - shown.length;
  return `${n} ${n === 1 ? "child" : "children"}: ${shown.join(", ")}${rest > 0 ? `, +${rest}` : ""}`;
}

const parents = (n: number) => `${n} ${n === 1 ? "parent" : "parents"}`;

function andList(items: readonly string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function countParents(children: readonly NewsChild[]): number {
  return new Set(children.flatMap((c) => c.guardians)).size;
}

export type AudienceChoice = { kind: "all" } | { kind: "groups"; groups: readonly string[] } | { kind: "children"; ids: ReadonlySet<string> };

/**
 * "This goes to 14 parents in U7." / "This goes to 2 parents of Kaizan A." for what's ticked, counting each parent
 * once however many of their children it reaches. `children` is every child the staff member could reach.
 */
export function reachSentence(choice: AudienceChoice, children: readonly NewsChild[]): string {
  if (choice.kind === "all") return `This goes to every family: ${parents(countParents(children))}.`;
  if (choice.kind === "groups") {
    if (choice.groups.length === 0) return "Tick at least one group.";
    const n = countParents(children.filter((c) => choice.groups.includes(c.ageGroup)));
    return n === 0 ? `No parents in ${andList(choice.groups)} yet.` : `This goes to ${parents(n)} in ${andList(choice.groups)}.`;
  }
  const chosen = children.filter((c) => choice.ids.has(c.id));
  if (chosen.length === 0) return "Choose at least one child.";
  if (chosen.length > CHOSEN_MAX) return `Choose up to ${CHOSEN_MAX} children. For more, send it to their groups.`;
  const n = countParents(chosen);
  const who = chosen.length <= 2 ? andList(chosen.map((c) => shortName(c.firstName, c.lastName))) : `${chosen.length} children`;
  return n === 0 ? `${who} ${chosen.length === 1 ? "has" : "have"} no parents in the club's list yet.` : `This goes to ${parents(n)} of ${who}${who.endsWith(".") ? "" : "."}`;
}
