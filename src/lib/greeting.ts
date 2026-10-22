// The name a member of staff is greeted by. Display names often start with how the children address them
// ("Uncle Tariq", "Coach Sami"), so the greeting skips that word and uses the first real name.

const HONORIFICS = new Set(["uncle", "coach", "brother", "sister", "aunty", "auntie", "mr", "mrs", "ms", "miss"]);

/** "Uncle Tariq" → "Tariq", "Mr. Ali Khan" → "Ali", "Hamza" → "Hamza"; a name that is only an honorific stays as it is. */
export function greetingName(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const real = words.find((w) => !HONORIFICS.has(w.toLowerCase().replace(/\.$/, "")));
  return real ?? words[0] ?? "";
}

/**
 * How a member of staff is named to parents: one convention everywhere. A name the children use with its title
 * stays as it is ("Coach Monju", "Uncle Tariq"); a plain full name becomes the first name only ("Adnan Sarayqum" →
 * "Adnan"), so parents never see one person by title and another by surname.
 */
export function staffNameForParents(displayName: string | null): string | null {
  if (!displayName) return null;
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (HONORIFICS.has(words[0].toLowerCase().replace(/\.$/, ""))) return words.slice(0, 2).join(" ");
  return words[0];
}
