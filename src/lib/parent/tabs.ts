// Which bottom tab a parent screen belongs to. The URLs stay as they are (/friday, /player): bookmarks and the
// installed app's offline page depend on them; only the labels say Sessions and Family.

export type Tab = "news" | "friday" | "checklist" | "shop" | "player";

const TAB_OF_SEGMENT: Record<string, Tab> = {
  news: "news",
  friday: "friday",
  pass: "friday",
  practice: "friday",
  checklist: "checklist",
  shop: "shop",
  player: "player",
  messages: "player",
};

/** `from` (a ?from= on the URL) wins when a page was opened from another tab, e.g. medical needs from To-do. */
export function tabFor(segment: string | null, from: string | null): Tab | null {
  if (from) {
    const first = from.replace(/^\//, "").split(/[/?#]/)[0];
    if (first in TAB_OF_SEGMENT) return TAB_OF_SEGMENT[first];
  }
  return segment ? (TAB_OF_SEGMENT[segment] ?? null) : null;
}

/** The name of the screen a back link goes to, for "← To-do" rather than "← Back". */
export function sectionName(path: string): string {
  const first = path.replace(/^\//, "").split(/[/?#]/)[0];
  const second = path.replace(/^\//, "").split(/[?#]/)[0].split("/")[1];
  if (first === "checklist") return "To-do";
  if (first === "player") return second === "child" ? "Child's details" : "Family";
  return { news: "Club news", friday: "Sessions", pass: "QR codes", practice: "Practise at home", shop: "Club shop", messages: "Messages" }[first] ?? "Back";
}

/** The parent screens a ?from= may point back to. Anything else (another site, staff pages) falls back. */
const BACK_OK = /^\/(news|friday|pass|practice|checklist|shop|player|messages)(\/[A-Za-z0-9/_-]*)?(\?[A-Za-z0-9=&_-]*)?$/;

/**
 * Where a page's back link goes: the screen it was opened from (?from=, checked), else its usual parent. The label
 * names that screen ("← To-do"), never just "Back".
 */
export function backTarget(from: unknown, fallback: { href: string; label: string }): { href: string; label: string } {
  if (typeof from === "string" && BACK_OK.test(from) && !from.startsWith("//")) return { href: from, label: sectionName(from) };
  return fallback;
}
