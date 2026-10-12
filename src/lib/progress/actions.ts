"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { aiConfigured, askClaude } from "../ai/claude";
import { PROGRESS_REPORT_SYSTEM, progressReportInput } from "../ai/prompts";
import { requireAdmin, requireStaff, staffGroups } from "../auth/session";
import { UUID } from "../auth/tokens";
import { enqueue } from "../background";
import { asUser } from "../db";
import type { Queryable } from "../db/types";
import { londonIsoDate } from "../dates";
import { progressForParents, setProgressForParents } from "../settings";
import { cleanBody } from "../validate";
import { loadMonthFacts, loadProgress, saveReport, saveSessionRatings, type RatingInput } from "./data";
import { notifyReportPublished } from "./notify";
import { CATEGORIES, REPORT_MAX, categoryLine, monthLabel, monthOnly, readScores, reportMonths } from "./ratings";

// Ratings, progress reports and the admin switch (migration 0026). Each checks the session and coach scope (own
// groups only, admins any), then writes as that person, so row level security applies too.

export type ProgressFormState = { error?: string; saved?: boolean; message?: string };

const RELOAD = "Something went wrong. Reload and try again.";
const nameOf = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : "One child");
const MAX_ROWS = 200;

/** Saves the ratings page for one session: complete rows only; a row with some scores but not all is refused by name. */
export async function saveRatings(_prev: ProgressFormState, formData: FormData): Promise<ProgressFormState> {
  const user = await requireStaff();
  const sessionId = formData.get("session");
  const players = formData.getAll("player").filter((p): p is string => typeof p === "string" && UUID.test(p));
  if (typeof sessionId !== "string" || !UUID.test(sessionId) || players.length === 0 || players.length > MAX_ROWS) return { error: RELOAD };

  const ratings: RatingInput[] = [];
  const partial: string[] = [];
  for (const id of new Set(players)) {
    const row = readScores((n) => formData.get(n), id);
    if (row.kind === "full") ratings.push({ playerId: id, scores: row.scores });
    else if (row.kind === "partial") partial.push(`${nameOf(formData.get(`name.${id}`))} (${row.missing.join(", ")})`);
  }
  if (partial.length) {
    return { error: `Finish all five scores or clear the row: ${partial.join("; ")}. Nothing was saved.` };
  }
  if (ratings.length === 0) return { error: "Tap a score in all five for at least one child, then save." };

  const result = await asUser(user.id, (tx) =>
    saveSessionRatings(tx, { sessionId, staffId: user.staff.id, groups: staffGroups(user.staff), now: new Date(), ratings }),
  );
  if ("error" in result) return { error: result.error };
  refresh();
  return { saved: true, message: `Saved ratings for ${result.saved} ${result.saved === 1 ? "child" : "children"}.` };
}

/** Admins only: shows or hides ratings and published reports for every parent. Switching on needs the ticked box. */
export async function switchProgressForParents(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const on = formData.get("on") === "yes";
  if (on && formData.get("confirm") !== "yes") redirect("/coach/ratings?switch=confirm#parents-switch");
  await asUser(user.id, (tx) => setProgressForParents(tx, on, user.staff.id));
  redirect(`/coach/ratings?switch=${on ? "on" : "off"}#parents-switch`);
}

/** The child's first name when they're in one of `groups`, else null. */
async function childInGroups(tx: Queryable, playerId: string, groups: string[]): Promise<string | null> {
  const [row] = await tx.query<{ first_name: string }>(`select first_name from players where id = $1 and age_group::text = any ($2::text[])`, [playerId, groups]);
  return row?.first_name ?? null;
}

/** Save draft (hidden from parents) or Publish. Publishing emails the parents once, only while progress is switched on. */
export async function saveProgressReport(_prev: ProgressFormState, formData: FormData): Promise<ProgressFormState> {
  const user = await requireStaff();
  const player = formData.get("player");
  const month = formData.get("month");
  const publish = formData.get("do") === "publish";
  const raw = formData.get("body");
  if (typeof player !== "string" || !UUID.test(player) || typeof month !== "string") return { error: RELOAD };
  if (!reportMonths(londonIsoDate(new Date())).includes(month)) return { error: "Reports can be written for this month and last only. Reload and try again." };
  const body = cleanBody(raw, REPORT_MAX + 1);
  if (!body) return { error: "Write the report first." };
  if (body.length > REPORT_MAX) return { error: `Keep the report to ${REPORT_MAX} characters. It's ${(typeof raw === "string" ? raw.trim() : body).length} now.` };

  const result = await asUser(user.id, async (tx) => {
    const firstName = await childInGroups(tx, player, staffGroups(user.staff));
    if (!firstName) return null;
    const saved = await saveReport(tx, { playerId: player, month, body, staffId: user.staff.id, publish });
    return { firstName, ...saved, shown: await progressForParents(tx) };
  });
  if (!result) return { error: "You can write reports for your own groups only." };
  if (result.email) after(() => enqueue("progress report email", () => notifyReportPublished(result.id)));
  refresh();
  const name = monthOnly(month);
  if (!publish) return { saved: true, message: `Draft saved. ${result.firstName}'s parents can't see it.` };
  if (!result.shown) return { saved: true, message: "Saved. Parents will see it once progress reports are switched on." };
  return {
    saved: true,
    message: result.email ? `Published. ${result.firstName}'s parents have been emailed that the ${name} report is ready.` : `Published. ${result.firstName}'s parents can read it in the app.`,
  };
}

export type ReportDraft = { body?: string; error?: string };
const recent = new Map<string, number[]>();

/** "Draft with AI": a report written from the app's facts for one child and month. Nothing is saved from here. */
export async function draftProgressReport(playerId: string, month: string, coachWords: string): Promise<ReportDraft> {
  const user = await requireStaff();
  if (!aiConfigured()) return { error: "AI help isn't switched on yet." };
  const today = londonIsoDate(new Date());
  if (!UUID.test(playerId) || !reportMonths(today).includes(month)) return { error: RELOAD };
  const now = Date.now();
  const mine = (recent.get(user.id) ?? []).filter((t) => now - t < 600_000);
  if (mine.length >= 20) return { error: "That's a lot of drafts. Try again in a few minutes." };
  recent.set(user.id, [...mine, now]);

  const facts = await asUser(user.id, async (tx) => {
    const firstName = await childInGroups(tx, playerId, staffGroups(user.staff));
    if (!firstName) return null;
    const [progress, month_] = await Promise.all([loadProgress(tx, playerId, today), loadMonthFacts(tx, playerId, month, today)]);
    return { firstName, progress, month: month_ };
  });
  if (!facts) return { error: "You can write reports for your own groups only." };
  const { progress } = facts;
  const input = progressReportInput({
    firstName: facts.firstName,
    month: monthLabel(month),
    ratings: progress.current ? CATEGORIES.map((c) => categoryLine(c.label, progress.current![c.key], progress.previous ? progress.previous[c.key] : null)) : [],
    ratingsCount: progress.count,
    ...facts.month,
    coachWords: cleanBody(coachWords, 1500),
  });
  try {
    const reply = await askClaude(PROGRESS_REPORT_SYSTEM, input);
    const body = reply.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim().slice(0, REPORT_MAX);
    return { body };
  } catch (error) {
    console.error("[ai] progress report draft failed:", error instanceof Error ? error.message : error);
    return { error: "The AI couldn't help just now. Your text is unchanged; try again in a minute." };
  }
}
