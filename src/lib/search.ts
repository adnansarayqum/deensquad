// Name search for lists of children on staff screens (gate register, squad picker). Pure, so the
// screens filter as the coach types, with no request.

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** The words someone typed, lower case, accents and punctuation dropped ("Musa S." → ["musa", "s"]). */
export function searchWords(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * True when every typed word starts one of the child's names: "mus" finds Musa, "s" finds Sami and anyone
 * whose last name (or last initial) starts with S, "musa s" finds Musa S. An empty search matches everyone.
 */
export function matchesName(query: string, ...names: string[]): boolean {
  const words = searchWords(query);
  if (words.length === 0) return true;
  const own = names.flatMap((n) => searchWords(n));
  return words.every((w) => own.some((n) => n.startsWith(w)));
}
