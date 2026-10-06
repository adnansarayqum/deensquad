// The name a member of staff is greeted by. Display names often start with how the children address them
// ("Uncle Tariq", "Coach Sami"), so the greeting skips that word and uses the first real name.

const HONORIFICS = new Set(["uncle", "coach", "brother", "sister", "aunty", "auntie", "mr", "mrs", "ms", "miss"]);

/** "Uncle Tariq" → "Tariq", "Mr. Ali Khan" → "Ali", "Hamza" → "Hamza"; a name that is only an honorific stays as it is. */
export function greetingName(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const real = words.find((w) => !HONORIFICS.has(w.toLowerCase().replace(/\.$/, "")));
  return real ?? words[0] ?? "";
}
