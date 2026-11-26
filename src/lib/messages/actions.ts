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
import { BODY_MAX, SUBJECT_MAX, addMessage, chatThread, loadInbox, loadMessageChild, loadReplyTarget, loadThread, markRead, startParentConversation, startStaffConversation } from "./data";
import { runMessageNotices } from "./run";
import type { Queryable } from "../db/types";
import { attachOrThrow, formMedia, withMediaProblem } from "../media/attach";
import { mediaPhrase } from "../media/limits";

/** "Sent 2 photos and a video." for a message with pictures and no words. */
async function onlyMediaBody(tx: Queryable, ids: string[]): Promise<string> {
  const rows = await tx.query<{ kind: "image" | "video" }>(`select kind from media where id = any ($1::uuid[])`, [ids]);
  const phrase = mediaPhrase(rows.map((r) => r.kind));
  return phrase ? `Sent ${phrase}.` : "Sent a photo.";
}

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

  // One child, or several ticked: the same message goes into each child's own conversation (their coaches differ).
  const children = [...new Set(formData.getAll("child").filter((c): c is string => typeof c === "string" && UUID.test(c)))];
  if (children.length === 0) return { error: "Choose which child it's about." };
  const about = formData.get("about");
  const aboutId = typeof about === "string" && UUID.test(about) ? about : null;
  if (aboutId && children.length > 1) return { error: RELOAD };
  const subject = cleanText(formData.get("subject"), SUBJECT_MAX);
  const forAdmins = formData.get("to") === "admins";
  const result = await asUser(user.id, async (tx): Promise<{ ids: string[] } | { error: string }> => {
    const family = await loadFamily(tx);
    const ids = family?.children.map((c) => c.id) ?? [];
    if (children.some((c) => !ids.includes(c))) return { error: RELOAD };
    const started: string[] = [];
    for (const child of children) {
      const reply = aboutId ? await loadReplyTarget(tx, aboutId, child, ids) : null;
      if (aboutId && !reply) return { error: "Replies are closed for this message. Use Message the club instead." };
      started.push(await startParentConversation(tx, { childId: child, subject: reply ? null : subject, body: body!, reply, forAdmins: !reply && forAdmins }));
    }
    return { ids: started };
  });
  if ("error" in result) return result;
  for (const id of result.ids) notifyAfter(id);
  // Back to the family's chat, where the new message is the latest.
  redirect(`/messages?sent=${result.ids.length}`);
}

/**
 * A member of staff's message: a reply in a conversation they can see, or a new one with a child's family (a group
 * coach only for children in their own groups; admins any).
 */
export async function sendStaffMessage(_prev: MessageFormState, formData: FormData): Promise<MessageFormState> {
  const user = await requireStaff();
  // Staff can attach photos and videos (the owner's decision: parents send words only). A message that's only
  // pictures says so in words ("Sent 2 photos."), which is what lists and screen readers show.
  const media = await formMedia(formData, user.staff.id);
  if ("error" in media) return media;
  let body = readBody(formData);
  if (!body && media.ids.length) body = await asUser(user.id, (tx) => onlyMediaBody(tx, media.ids));
  const problem = bodyProblem(body);
  if (problem) return { error: problem };
  const attach = async (tx: Queryable, messageId: string) => attachOrThrow(tx, "message", messageId, media.ids, user.staff.id);
  const conversation = formData.get("conversation");
  if (typeof conversation === "string" && conversation) {
    if (!UUID.test(conversation)) return { error: RELOAD };
    const ok = await withMediaProblem(() =>
      asUser(user.id, async (tx) => {
        if (!(await loadThread(tx, conversation, "staff"))) return false;
        await attach(tx, await addMessage(tx, conversation, "staff", body!));
        return true;
      }),
    );
    if (typeof ok === "object") return ok;
    if (!ok) return { error: RELOAD };
    notifyAfter(conversation);
    refresh();
    return { saved: true };
  }

  const child = formData.get("child");
  if (typeof child !== "string" || !UUID.test(child)) return { error: RELOAD };
  const subject = cleanText(formData.get("subject"), SUBJECT_MAX);
  const mine = coachLimit(user.staff);
  const id = await withMediaProblem(() =>
    asUser(user.id, async (tx) => {
      if (!(await loadMessageChild(tx, child, mine))) return null;
      const started = await startStaffConversation(tx, { childId: child, staffId: user.staff.id, subject, body: body! });
      const [first] = await tx.query<{ id: string }>(`select id from conversation_messages where conversation_id = $1 order by created_at, id limit 1`, [started]);
      await attach(tx, first.id);
      return started;
    }),
  );
  if (id && typeof id === "object") return id;
  if (!id) return { error: mine ? `You can message families in your own groups only (${mine.join(", ")}).` : RELOAD };
  notifyAfter(id);
  redirect(`/admin/messages/family/${child}?sent=1`);
}

/** The staff inbox's "Mark all read": every conversation this person sees with a parent's message they haven't opened. */
/**
 * "Mark all as read". On Needs reply it asks first (a ticked box): reading isn't replying, and those are families
 * waiting for an answer. On Not coming (reasons that are also on the register) it marks them straight away.
 */
export async function markAllRead(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const absences = formData.get("scope") === "absences";
  if (!absences && formData.get("confirm") !== "yes") redirect("/admin/messages?show=unread&markall=confirm");
  await asUser(user.id, async (tx) => {
    // A reason that mentions an injury or illness is opened and read, never swept up here.
    const rows = absences ? (await loadInbox(tx, { absences: true, limit: 500 })).filter((r) => r.unread && !r.health) : await loadInbox(tx, { unreadOnly: true, limit: 500 });
    for (const row of rows) await markRead(tx, row.id);
  });
  refresh();
}

const aboutChild = (formData: FormData): string | null => {
  const about = formData.get("about");
  return typeof about === "string" && UUID.test(about) ? about : null;
};

/**
 * A parent's message in their family's chat with the club. It carries on the conversation the chat's latest message
 * is in; with several children, choosing another child (`about`) puts it in that child's own conversation, so their
 * coaches are the ones told. A family with nothing yet starts a conversation with the coaches.
 */
export async function sendChatMessage(_prev: MessageFormState, formData: FormData): Promise<MessageFormState> {
  const user = await requireParent();
  const body = readBody(formData);
  const problem = bodyProblem(body);
  if (problem) return { error: problem };
  const result = await asUser(user.id, async (tx): Promise<{ id: string } | { error: string }> => {
    const family = await loadFamily(tx);
    const ids = family?.children.map((c) => c.id) ?? [];
    if (!ids.length) return { error: "No players are linked to your email yet. Ask the club to add your child." };
    const about = aboutChild(formData);
    if (about && !ids.includes(about)) return { error: RELOAD };
    const target = (await chatThread(tx, { parent: ids }, about)) ?? (ids.length === 1 ? { child: ids[0] } : null);
    if (!target) return { error: "Choose which child it's about." };
    if ("conversationId" in target) {
      await addMessage(tx, target.conversationId, "parent", body!);
      return { id: target.conversationId };
    }
    return { id: await startParentConversation(tx, { childId: target.child, subject: null, body: body!, reply: null }) };
  });
  if ("error" in result) return result;
  notifyAfter(result.id);
  refresh();
  return { saved: true };
}

/**
 * A member of staff's message in a family's chat (`family`: a child of the family). Like the parent's, it carries on
 * the latest conversation unless they choose another child; starting a new conversation keeps the coach rule (a
 * group coach only for children in their own groups).
 */
export async function sendStaffChatMessage(_prev: MessageFormState, formData: FormData): Promise<MessageFormState> {
  const user = await requireStaff();
  const family = formData.get("family");
  if (typeof family !== "string" || !UUID.test(family)) return { error: RELOAD };
  const media = await formMedia(formData, user.staff.id);
  if ("error" in media) return media;
  let body = readBody(formData);
  if (!body && media.ids.length) body = await asUser(user.id, (tx) => onlyMediaBody(tx, media.ids));
  const problem = bodyProblem(body);
  if (problem) return { error: problem };
  const mine = coachLimit(user.staff);
  const result = await withMediaProblem(() =>
    asUser(user.id, async (tx): Promise<{ id: string } | { error: string }> => {
      // Another child may be chosen only from the same family.
      const about = aboutChild(formData);
      if (about && about !== family) {
        const [same] = await tx.query<{ ok: boolean }>(
          `select (select f.family_id from player_families() f where f.player_id = $1) = (select f.family_id from player_families() f where f.player_id = $2) as ok`,
          [about, family],
        );
        if (!same?.ok) return { error: RELOAD };
      }
      const target = (await chatThread(tx, { staff: family }, about)) ?? { child: family };
      let conversation: string;
      if ("conversationId" in target) {
        conversation = target.conversationId;
        await attachOrThrow(tx, "message", await addMessage(tx, conversation, "staff", body!), media.ids, user.staff.id);
      } else {
        if (!(await loadMessageChild(tx, target.child, mine))) return { error: mine ? `You can start a conversation about children in your own groups only (${mine.join(", ")}).` : RELOAD };
        conversation = await startStaffConversation(tx, { childId: target.child, staffId: user.staff.id, subject: null, body: body! });
        const [first] = await tx.query<{ id: string }>(`select id from conversation_messages where conversation_id = $1 order by created_at, id limit 1`, [conversation]);
        await attachOrThrow(tx, "message", first.id, media.ids, user.staff.id);
      }
      return { id: conversation };
    }),
  );
  if ("error" in result) return result;
  notifyAfter(result.id);
  refresh();
  return { saved: true };
}
