"use server";

import { requireStaff } from "../auth/session";
import { cleanBody } from "../validate";
import { aiConfigured, askClaude } from "./claude";
import { SYSTEM, WANTS_TITLE, parseDraft, type DraftKind } from "./prompts";

export type DraftResult = { title?: string; body?: string; error?: string };

const KINDS = new Set<DraftKind>(["plan", "news", "practice", "practiceFromPlan", "note"]);
const recent = new Map<string, number[]>();

/** A draft for the coach to check. Nothing is saved or sent from here. */
export async function draftWithAI(kind: string, text: string, context?: string): Promise<DraftResult> {
  const user = await requireStaff();
  if (!aiConfigured()) return { error: "AI help isn't switched on yet." };
  if (!KINDS.has(kind as DraftKind)) return { error: "Something went wrong. Reload and try again." };
  const notes = cleanBody(text, 4000);
  if (!notes) return { error: "Say or type a few words first, then tap Tidy up." };

  // A light brake: 20 drafts per person in 10 minutes is plenty.
  const now = Date.now();
  const mine = (recent.get(user.id) ?? []).filter((t) => now - t < 600_000);
  if (mine.length >= 20) return { error: "That's a lot of drafts. Try again in a few minutes." };
  recent.set(user.id, [...mine, now]);

  const extra = cleanBody(context, 200);
  try {
    const reply = await askClaude(SYSTEM[kind as DraftKind], extra ? `${extra}\n\nCoach's notes:\n${notes}` : notes);
    return parseDraft(reply, WANTS_TITLE[kind as DraftKind]);
  } catch (error) {
    console.error("[ai] draft failed:", error instanceof Error ? error.message : error);
    return { error: "The AI couldn't help just now. Your text is unchanged; try again in a minute." };
  }
}
