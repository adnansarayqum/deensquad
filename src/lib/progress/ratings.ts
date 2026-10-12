// Player ratings: five categories scored 1 to 5 after a session (migration 0026). Pure helpers shared by the coach
// pages, the parent's Progress card and the AI draft: the categories, a child's averages for the last 3 months against
// the 3 before, and how each is said in words.

export const CATEGORIES = [
  { key: "technique", label: "Technique" },
  { key: "game_understanding", label: "Game understanding" },
  { key: "physical", label: "Physical" },
  { key: "attitude", label: "Attitude and effort" },
  { key: "teamwork", label: "Teamwork" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];
export type Scores = Record<CategoryKey, number>;

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as CategoryKey[];

export type RatingRow = Scores & { ratedOn: string; by: string | null };

/** How far back each period reaches: the last 3 months is "now", the 3 before that is "before". */
export const PERIOD_MONTHS = 3;

/** The ISO date `months` calendar months before `isoDate` (a day that doesn't exist, e.g. 31 Feb, becomes the month's last). */
export function monthsBefore(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

function average(rows: Scores[]): Scores | null {
  if (rows.length === 0) return null;
  const out = {} as Scores;
  for (const k of CATEGORY_KEYS) out[k] = rows.reduce((sum, r) => sum + r[k], 0) / rows.length;
  return out;
}

export type ProgressSummary = {
  /** Average of each category over the last 3 months (rated after `currentFrom`), or null with none. */
  current: Scores | null;
  /** The 3 months before that, or null with none. */
  previous: Scores | null;
  /** Ratings in the last 3 months, and the first date among them ("since September"). */
  count: number;
  since: string | null;
  last: { ratedOn: string; by: string | null } | null;
};

/**
 * Splits a child's ratings (any order) into the last 3 months (after `today` minus 3 months, up to `today`) and the 3
 * months before, and averages each. `today` is a London ISO date.
 */
export function summariseRatings(rows: RatingRow[], today: string): ProgressSummary {
  const currentFrom = monthsBefore(today, PERIOD_MONTHS);
  const previousFrom = monthsBefore(today, PERIOD_MONTHS * 2);
  const current = rows.filter((r) => r.ratedOn > currentFrom && r.ratedOn <= today);
  const previous = rows.filter((r) => r.ratedOn > previousFrom && r.ratedOn <= currentFrom);
  const sorted = [...current].sort((a, b) => (a.ratedOn < b.ratedOn ? -1 : a.ratedOn > b.ratedOn ? 1 : 0));
  const latest = sorted.at(-1);
  return {
    current: average(current),
    previous: average(previous),
    count: current.length,
    since: sorted[0]?.ratedOn ?? null,
    last: latest ? { ratedOn: latest.ratedOn, by: latest.by } : null,
  };
}

/** One decimal place, as said everywhere ("3.8"). */
export const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** "Technique 3.8 of 5, up from 3.2" (or "down from", "the same as before", or no comparison without an earlier period). */
export function categoryLine(label: string, now: number, before: number | null): string {
  const head = `${label} ${oneDecimal(now)} of 5`;
  if (before === null) return head;
  const a = oneDecimal(now);
  const b = oneDecimal(before);
  if (a === b) return `${head}, the same as before`;
  return `${head}, ${Number(a) > Number(b) ? "up" : "down"} from ${b}`;
}

/** The pentagon's accessible summary: every category's score in words. */
export function summaryLabel(firstName: string, current: Scores, previous: Scores | null): string {
  return `${firstName}'s ratings, last 3 months: ${CATEGORIES.map((c) => categoryLine(c.label, current[c.key], previous ? previous[c.key] : null)).join("; ")}.`;
}

const monthName = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/** "Rated 6 times since September" / "Rated once in October". */
export function ratedLine(count: number, since: string | null): string {
  if (count === 0 || !since) return "Not rated in the last 3 months";
  return count === 1 ? `Rated once, in ${monthName(since)}` : `Rated ${count} times since ${monthName(since)}`;
}

/** The first of the month an ISO date falls in ("2026-10-01"). */
export const firstOfMonth = (isoDate: string) => `${isoDate.slice(0, 7)}-01`;

/** "October 2026" for a month's first day. */
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`));

/** "October" for a month's first day. */
export const monthOnly = (month: string) => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`));

/** The months a report can be written for on `today` (London): this month and last, newest first. */
export function reportMonths(today: string): string[] {
  const now = firstOfMonth(today);
  return [now, firstOfMonth(monthsBefore(now, 1))];
}

/** A `?month=YYYY-MM` value when it's one of `allowed`, else the first of them. */
export function pickMonth(asked: unknown, allowed: string[]): string {
  const want = typeof asked === "string" && /^\d{4}-\d{2}$/.test(asked) ? `${asked}-01` : null;
  return want && allowed.includes(want) ? want : allowed[0];
}

/** The most a progress report may say (the database refuses more). */
export const REPORT_MAX = 1500;

/**
 * Reads a row of five scores from a form: `r.<player>.<category>` = 1..5. "blank" when none are filled, "partial"
 * with the missing categories' labels, else the scores. Anything that isn't 1 to 5 counts as not filled.
 */
export function readScores(get: (name: string) => unknown, playerId: string): { kind: "blank" } | { kind: "partial"; missing: string[] } | { kind: "full"; scores: Scores } {
  const scores = {} as Scores;
  const missing: string[] = [];
  for (const c of CATEGORIES) {
    const raw = get(`r.${playerId}.${c.key}`);
    const n = typeof raw === "string" && /^[1-5]$/.test(raw) ? Number(raw) : null;
    if (n === null) missing.push(c.label);
    else scores[c.key] = n;
  }
  if (missing.length === CATEGORIES.length) return { kind: "blank" };
  if (missing.length) return { kind: "partial", missing };
  return { kind: "full", scores };
}
