"use server";

import { after } from "next/server";
import { requireAdmin } from "../auth/session";
import { UUID } from "../auth/tokens";
import { enqueue } from "../background";
import { runChase } from "../chase/run";
import { asUser } from "../db";
import { applyDraft, dismissDraft } from "./confirm";

export type DraftOutcome = { ok: boolean; message: string; link?: string | null };

/** Confirm on one of the assistant's drafts: does it (confirm.ts) and, for news that asks to be read, starts the chase. */
export async function confirmDraft(id: string): Promise<DraftOutcome> {
  const user = await requireAdmin();
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, message: "Something went wrong. Ask again." };
  const result = await asUser(user.id, (tx) => applyDraft(tx, id, user.staff.id));
  if (!result.ok) return { ok: false, message: result.message };
  const chase = result.chase;
  if (chase && result.requiresAck) after(() => enqueue("chase on post", () => runChase({ announcementId: chase })));
  return { ok: true, message: result.message, link: result.link };
}

export async function dismissAssistantDraft(id: string): Promise<DraftOutcome> {
  const user = await requireAdmin();
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, message: "Something went wrong." };
  await asUser(user.id, (tx) => dismissDraft(tx, id, user.staff.id));
  return { ok: true, message: "Left as it was." };
}
