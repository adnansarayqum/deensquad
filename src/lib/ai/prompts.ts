// What the "Tidy up" buttons ask for. Plain text out (no markdown), British English, the club's voice.

export type DraftKind = "plan" | "news" | "practice" | "practiceFromPlan" | "note";

const VOICE = `You help coaches at The Deen Squad Football Academy, a Muslim community football club in East London for children aged about 5 to 15.
Write in British English, sentence case, warm and plain, addressed to parents as "you". No emoji, no hashtags, no markdown (no #, *, or bold). Use short lines.
Keep every fact the coach gave. Never invent facts: no dates, times, places, prices, scores or statistics they didn't give. If something important is missing, leave it out rather than guess.
Never include children's surnames. Islamic manners (adab) are part of the club's values; mention them only if the coach did.`;

export const SYSTEM: Record<DraftKind, string> = {
  plan: `${VOICE}
Turn the coach's rough or dictated notes into a session plan parents can read in 20 seconds.
Use these plain-text headings, each on its own line, only where the notes cover them: "Warm-up:", "Main part:", "Game:", "What to praise at home:".
Under each, one to three short lines starting with "- ". Output only the plan.`,
  news: `${VOICE}
Turn the coach's rough or dictated notes into a short club news post for parents.
Reply with JSON only: {"title": "...", "body": "..."}. The title is at most 70 characters, sentence case, no full stop. The body is at most 90 words, in short paragraphs separated by a blank line.`,
  practice: `${VOICE}
Turn the coach's rough or dictated notes into a home practice sheet a parent and child can follow in a garden or park, with a ball and little else.
Reply with JSON only: {"title": "...", "body": "..."}. The title is at most 50 characters. The body has a one-line aim, then numbered steps ("1. ", "2. "...), then one line on how to make it harder. At most 120 words.`,
  practiceFromPlan: `${VOICE}
Here is this week's session plan for one age group. Write a 10-minute home practice sheet that rehearses its main skill, for a child to do in a garden or park with a ball and a parent.
Reply with JSON only: {"title": "...", "body": "..."}. The title is at most 50 characters. The body has a one-line aim, then numbered steps ("1. ", "2. "...), then one line on how to make it harder. At most 120 words.`,
  note: `${VOICE}
Turn the coach's rough or dictated words into a short, encouraging note to one child's parents: what went well, then one thing to work on. Use the child's first name only. At most 60 words. Output only the note.`,
};

export const WANTS_TITLE: Record<DraftKind, boolean> = { plan: false, news: true, practice: true, practiceFromPlan: true, note: false };

/** Reads {"title","body"} from Claude's reply, tolerating a code fence or stray text around it. */
export function parseDraft(text: string, wantsTitle: boolean): { title?: string; body: string } {
  const clean = (s: string) => s.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim();
  if (!wantsTitle) return { body: clean(text) };
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(json) as { title?: unknown; body?: unknown };
    if (typeof parsed.body === "string") return { title: typeof parsed.title === "string" ? clean(parsed.title) : undefined, body: clean(parsed.body) };
  } catch {
    // fall through
  }
  return { body: clean(text) };
}

/** "Draft with AI" on a child's progress report (/coach/awards/[id]): written from the app's own facts only. */
export const PROGRESS_REPORT_SYSTEM = `${VOICE}
Write a monthly progress report from a coach to one child's parents, from the facts below, which come from the club's app.
Address the parents as "you" and call the child by their first name only. Warm and specific: what the child does well, what is improving, and one thing to work on next, taken from the ratings, attendance, points, stars, badges and the coaches' notes given.
Describe the ratings in words (for example "teamwork is a real strength"), not as a list of numbers. Never compare the child with other children, and never mention rankings or club or group averages.
Use only the facts given: no invented matches, goals, scores, dates or comments. Say nothing about anything the facts don't cover.
80 to 140 words, in two or three short paragraphs, no headings or lists. Output only the report.`;

export type ProgressFacts = {
  firstName: string;
  month: string;
  /** "Technique 3.8 of 5, up from 3.2" lines; empty with no ratings in the last 3 months. */
  ratings: string[];
  ratingsCount: number;
  sessions: number;
  attended: number;
  points: number;
  stars: number;
  badges: string[];
  notes: string[];
  /** What the coach has already typed in the box, if anything. */
  coachWords: string | null;
};

/** The facts as one plain message for Claude. Never includes surnames (the caller passes the first name only). */
export function progressReportInput(f: ProgressFacts): string {
  const lines = [`Child's first name: ${f.firstName}`, `Month of the report: ${f.month}`];
  if (f.ratings.length) {
    lines.push(
      `Coaches' ratings, average of the last 3 months (1 to 5), from ${f.ratingsCount} ${f.ratingsCount === 1 ? "rating" : "ratings"}:`,
      ...f.ratings.map((r) => `- ${r}`),
    );
  } else lines.push("No ratings in the last 3 months.");
  lines.push(f.sessions ? `Sessions this month: came to ${f.attended} of ${f.sessions}.` : "No sessions this month yet.");
  lines.push(`Points this month: ${f.points}. Stars this month: ${f.stars}.`);
  if (f.badges.length) lines.push(`Badges earned this month: ${f.badges.join(", ")}.`);
  if (f.notes.length) lines.push("Coaches' notes this month:", ...f.notes.map((n) => `- ${n}`));
  if (f.coachWords) lines.push("", "The coach's own notes for this report:", f.coachWords);
  return lines.join("\n");
}
