/**
 * A family's name for its chat, from its parents' full names: "Adnan and Sara Sample" when they share a surname,
 * else the names in a row ("Mohammed Uddin and Aisha Khan"). The child's family when no parent is linked yet.
 */
export function familyName(parents: readonly string[], child: { firstName: string; lastName: string } | undefined): string {
  if (!parents.length) return child ? `${child.firstName} ${child.lastName}'s family` : "Family";
  const split = parents.map((name) => {
    const at = name.lastIndexOf(" ");
    return at < 0 ? { first: name, last: "" } : { first: name.slice(0, at), last: name.slice(at + 1) };
  });
  const join = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
  const shared = split[0].last && split.every((p) => p.last.toLowerCase() === split[0].last.toLowerCase());
  return shared ? `${join(split.map((p) => p.first))} ${split[0].last}` : join([...parents]);
}

/** Two letters for the round mark beside a chat: the first parent's initials (the child's when there's no parent). */
export function familyInitials(parents: readonly string[], child: { firstName: string; lastName: string } | undefined): string {
  const name = parents[0] ?? (child ? `${child.firstName} ${child.lastName}` : "?");
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
