"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { coachLimit, requireParent, requireStaff } from "../auth/session";
import { UUID } from "../auth/tokens";
import { enqueue } from "../background";
import { asUser } from "../db";
import { loadFamily, saveQuickAnswer } from "../parent/data";
import { cleanBody, cleanText } from "../validate";
import { BODY_MAX, SUBJECT_MAX, addMessage, loadInbox, loadMessageChild, loadReplyTarget, loadThread, markRead, startParentConversation, startStaffConversation } from "./data";
import { runMessageNotices } from "./run";

// Messages between parents and the club, and quick answers on club news (migration 0025). Each action checks the
// session and its input, then writes as that person, so row level security applies as well.

const RELOAD = "Something went wrong. Reload and try again.";

/** Tells the other side once the response has gone (quiet hours and the 15-minute gap are checked there). */
function notifyAfter(conversationId: string) {
  after(() => enqueue("message notify", () => runMessageNotices({ conversationId })));
}

/** A quick answer on a club message ("Yes" for Yusuf). Overwrites an earlier one and marks the message read. */
export async function answerNews(announcementId: string, playerId: string, answer: string): Promise<{ error?: string }> {
  const user = await requireParent();
  if (!UUID.test(announcementId) || !UUID.test(playerId) || typeof answer !== "string" || answer.length > 30) return { error: RELOAD };
  const saved = await asUser(user.id, (tx) => saveQuickAnswer(tx, announcementId, playerId, answer));
  refresh();
  return saved ? {} : { error: "That didn't save. This message has changed, so reload the page and try again." };
}

export type MessageFormState = { error?: string; saved?: boolean };

function readBody(formData: FormData): string | null {
  return cleanBody(formData.get("body"), BODY_MAX + 1);
}

function bodyProblem(body: string | null): string | null {
  if (!body) return "Write your message.";
  if (body.length > BODY_MAX) return `Keep it to ${BODY_MAX} characters.`;
  return null;
}

/**
 * A parent's message: a reply in an existing conversation (`conversation`), or a new one about one of their children
 * (`child`), either replying to club news (`about`) or to the coaches with an optional subject. A new one opens it.
 */
export async function sendParentMessage(_prev: MessageFormState, formData: FormData): Promise<MessageFormState> {
  const user = await requireParent();
  const body = readBody(formData);
  const problem = bodyProblem(body);
  if (problem) return { error: problem };
  const conversation = formData.get("conversation");
  if (typeof conversation === "string" && conversation) {
    if (!UUID.test(conversation)) return { error: RELOAD };
    const ok = await asUser(user.id, async (tx) => {
      const family = await loadFamily(tx);
      const ids = family?.children.map((c) => c.id) ?? [];
      if (!(await loadThread(tx, conversation, { parent: ids }))) return false;
      await addMessage(tx, conversation, "parent", body!);
      return true;
    });
    if (!ok) return { error: RELOAD };
    notifyAfter(conversation);
    refresh();
    return { saved: true };
  }

  const child = formData.get("child");
  if (typeof child !== "string" || !UUID.test(child)) return { error: "Choose which child it's about." };
  const about = formData.get("about");
  const aboutId = typeof about === "string" && UUID.test(about) ? about : null;
  const subject = cleanText(formData.get("subject"), SUBJECT_MAX);
  const result = await asUser(user.id, async (tx): Promise<{ id: string } | { error: string }> => {
    const family = await loadFamily(tx);
    const ids = family?.children.map((c) => c.id) ?? [];
    if (!ids.includes(child)) return { error: RELOAD };
    const reply = aboutId ? await loadReplyTarget(tx, aboutId, child, ids) : null;
    if (aboutId && !reply) return { error: "Replies are closed for this message. Use Message the coaches instead." };
    return { id: await startParentConversation(tx, { childId: child, subject: reply ? null : subject, body: body!, reply }) };
  });
  if ("error" in result) return result;
  notifyAfter(result.id);
  redirect(`/messages/${result.id}?sent=1`);
}

/**
 * A member of staff's message: a reply in a conversation they can see, or a new one with a child's family (a group
 * coach only for children in their own groups; admins any).
 */
export async function sendStaffMessage(_prev: MessageFormState, formData: FormData): Promise<MessageFormState> {
  const user = await requireStaff();
  const body = readBody(formData);
  const problem = bodyProblem(body);
  if (problem) return { error: problem };
  const conversation = formData.get("conversation");
  if (typeof conversation === "string" && conversation) {
    if (!UUID.test(conversation)) return { error: RELOAD };
    const ok = await asUser(user.id, async (tx) => {
      if (!(await loadThread(tx, conversation, "staff"))) return false;
      await addMessage(tx, conversation, "staff", body!);
      return true;
    });
    if (!ok) return { error: RELOAD };
    notifyAfter(conversation);
    refresh();
    return { saved: true };
  }

  const child = formData.get("child");
  if (typeof child !== "string" || !UUID.test(child)) return { error: RELOAD };
  const subject = cleanText(formData.get("subject"), SUBJECT_MAX);
  const mine = coachLimit(user.staff);
  const id = await asUser(user.id, async (tx) => {
    if (!(await loadMessageChild(tx, child, mine))) return null;
    return startStaffConversation(tx, { childId: child, staffId: user.staff.id, subject, body: body! });
  });
  if (!id) return { error: mine ? `You can message families in your own groups only (${mine.join(", ")}).` : RELOAD };
  notifyAfter(id);
  redirect(`/admin/messages/${id}?sent=1`);
}

/** The staff inbox's "Mark all read": every conversation this person sees with a parent's message they haven't opened. */
export async function markAllRead(): Promise<void> {
  const user = await requireStaff();
  await asUser(user.id, async (tx) => {
    for (const row of await loadInbox(tx, { unreadOnly: true, limit: 500 })) await markRead(tx, row.id);
  });
  refresh();
}
