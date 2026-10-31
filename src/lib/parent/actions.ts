"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireParent } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asSystem, asUser } from "../db";
import { deletionRequestRecipients, requestAccountDeletion } from "../data-requests";
import { canSendEmail, sendEmails } from "../email/send";
import { deletionRequestEmail, newChildEmail } from "../email/templates";
import { CONTRACT } from "../documents/contract";
import { isAgeGroup, type Availability } from "../domain";
import { cleanPhone, cleanText } from "../validate";
import { appUrl, teamFeePayUrl } from "../config";
import { AWAY_REASON_MAX, reportFamilyPayAsYouGo, reportFamilyPayment, saveAnswer, saveAwayReason } from "./data";
import { runMessageNotices } from "../messages/run";
import { readPhoto } from "../files";
import { cleanPhoto } from "../photo-clean";
import { addMyChild, addMyCoParent, checkDateOfBirth, cleanName, clearMyChildPhoto, haveChild, loadMyChild, setMyChildPhoto, updateMyChild, updateMyDetails } from "./profile";
import { after } from "next/server";
import { normaliseEmail } from "../auth/tokens";
import { enqueue } from "../background";
import { sendCoParentInvite } from "../admin/invites";

// Parent Server Actions. Each checks the session, validates its input, then writes as that parent,
// so row level security (and the database functions) decide whether the write is allowed.

/** A tap's answer: nothing when it saved, or why it couldn't (shown beside the tap; see `TapProblem`). */
export type TapResult = { error?: string };

export async function acknowledgeAnnouncement(announcementId: string): Promise<TapResult> {
  const user = await requireParent();
  if (!UUID.test(announcementId)) return { error: "That didn't save. Reload the page and try again." };
  await asUser(user.id, (tx) =>
    tx.query(
      `insert into announcement_reads (announcement_id, guardian_id) values ($1, my_guardian_id()) on conflict do nothing`,
      [announcementId],
    ),
  );
  refresh();
  return {};
}

export async function setAvailability(sessionId: string, playerId: string, answer: Availability): Promise<TapResult> {
  const user = await requireParent();
  if (!UUID.test(sessionId) || !UUID.test(playerId) || (answer !== "coming" && answer !== "away")) {
    return { error: "That didn't save. Reload the page and try again." };
  }
  const saved = await asUser(user.id, (tx) => saveAnswer(tx, sessionId, playerId, answer));
  // Refused: the session has finished or been cancelled (or the child isn't in its squad any more). Show the page as it is now.
  refresh();
  return saved ? {} : { error: "That didn't save. This session has finished or changed, so it can't be answered now." };
}

/**
 * "All coming" on a session with several of the family's children: one tap answers Coming for each of them, the
 * same way as tapping each child's button (`saveAnswer` checks each child and the session).
 */
export async function setAllComing(sessionId: string, playerIds: string[]): Promise<TapResult> {
  const user = await requireParent();
  if (!UUID.test(sessionId) || !Array.isArray(playerIds) || playerIds.length === 0 || playerIds.length > 10 || !playerIds.every((id) => UUID.test(id))) {
    return { error: "That didn't save. Reload the page and try again." };
  }
  const saved = await asUser(user.id, async (tx) => {
    let n = 0;
    for (const id of playerIds) if (await saveAnswer(tx, sessionId, id, "coming")) n++;
    return n;
  });
  refresh();
  return saved === playerIds.length ? {} : { error: "That didn't save for everyone. This session has finished or changed, so check each child below." };
}

export type AwayReasonState = { error?: string; sent?: string; conversation?: string };

/**
 * The optional reason under Not coming ("poorly"): saved on the answer and sent to the coaches as a message in the
 * thread for that session and child, which notifies them as any parent's message does.
 */
export async function sendAwayReason(_prev: AwayReasonState, formData: FormData): Promise<AwayReasonState> {
  const user = await requireParent();
  const sessionId = formData.get("session");
  const playerId = formData.get("child");
  if (typeof sessionId !== "string" || typeof playerId !== "string" || !UUID.test(sessionId) || !UUID.test(playerId)) {
    return { error: "That didn't send. Reload the page and try again." };
  }
  const raw = String(formData.get("reason") ?? "");
  if (raw.trim().length > AWAY_REASON_MAX) return { error: `Keep it to ${AWAY_REASON_MAX} characters.` };
  const reason = cleanText(raw, AWAY_REASON_MAX);
  if (!reason) return { error: "Write a few words first, or leave it: it's optional." };
  const conversation = await asUser(user.id, (tx) => saveAwayReason(tx, sessionId, playerId, reason));
  refresh();
  if (!conversation) return { error: "That didn't send. This session has finished or changed, or the answer has changed to Coming." };
  after(() => enqueue("message notify", () => runMessageNotices({ conversationId: conversation })));
  return { sent: reason, conversation };
}

export type ContactFormState = { error?: string; saved?: boolean };

export async function addEmergencyContact(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const user = await requireParent();
  const childIds = formData.getAll("child").filter((v): v is string => typeof v === "string" && UUID.test(v));
  const name = cleanText(formData.get("name"), 80);
  const phone = cleanPhone(formData.get("phone"));
  const relationship = cleanText(formData.get("relationship"), 40);
  if (childIds.length === 0) return { error: "Choose which child this contact is for." };
  if (!name) return { error: "Add the contact's name." };
  if (!phone) {
    return {
      error: String(formData.get("phone") ?? "").trim()
        ? "That phone number doesn't look right. Type it like 07700 900123."
        : "Add a phone number we can call, like 07700 900123.",
    };
  }
  const parentsNumber = await asUser(user.id, async (tx) => {
    const [row] = await tx.query<{ yes: boolean }>(
      `select exists (
         select 1 from player_guardians pg join guardians g on g.id = pg.guardian_id
         where pg.player_id = any($1::uuid[]) and pg.player_id in (select my_player_ids()) and g.phone is not null
           and regexp_replace(g.phone, '[^0-9]', '', 'g') = regexp_replace($2, '[^0-9]', '', 'g')) as yes`,
      [childIds, phone],
    );
    return row.yes;
  });
  if (parentsNumber) {
    return {
      error: "That's a parent's number, which the club already has. Add someone else the club can call if they can't reach you, like a grandparent or a family friend.",
    };
  }
  await asUser(user.id, async (tx) => {
    for (const id of childIds) {
      await tx.query(
        `insert into emergency_contacts (player_id, name, phone, relationship)
         select $1, $2, $3, $4 where $1::uuid in (select my_player_ids())`,
        [id, name, phone, relationship],
      );
    }
  });
  refresh();
  return { saved: true };
}

export async function removeEmergencyContact(formData: FormData): Promise<void> {
  const user = await requireParent();
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return;
  await asUser(user.id, (tx) => tx.query(`delete from emergency_contacts where id = $1 and player_id in (select my_player_ids())`, [id]));
  refresh();
}

/** The photo answer for a child, and for any brothers or sisters ticked under "Same for" (each must be the parent's own). */
export async function savePhotoConsent(formData: FormData): Promise<void> {
  const user = await requireParent();
  const children = formData.getAll("child").filter((v): v is string => typeof v === "string" && UUID.test(v));
  const answer = formData.get("consent");
  if (children.length === 0 || (answer !== "yes" && answer !== "no")) return;
  await asUser(user.id, (tx) =>
    tx.query(`select set_photo_consent(id, $2) from unnest($1::uuid[]) as id where id in (select my_player_ids())`, [children, answer === "yes"]),
  );
  redirect("/checklist");
}

/**
 * "I've set it up" for the family's monthly plan: one tap covers each child named in the form whose plan is still
 * missing or overdue (`reportFamilyPayment`). Refused while the club has no TeamFeePay link, since there was nothing
 * to set up: the payment page then says the club will tell you how to pay.
 */
export async function reportPaymentSetup(formData: FormData): Promise<void> {
  const user = await requireParent();
  if (!teamFeePayUrl()) redirect("/checklist/payment");
  const children = formData.getAll("child").filter((v): v is string => typeof v === "string" && UUID.test(v));
  if (children.length) await asUser(user.id, (tx) => reportFamilyPayment(tx, children));
  redirect("/checklist");
}

/** The family stays on pay as you go, paying each session: for each child still without a plan. */
export async function choosePayAsYouGo(formData: FormData): Promise<void> {
  const user = await requireParent();
  const children = formData.getAll("child").filter((v): v is string => typeof v === "string" && UUID.test(v));
  if (children.length) await asUser(user.id, (tx) => reportFamilyPayAsYouGo(tx, children));
  redirect("/checklist");
}

export type AgreementState = { error?: string };

/** The parent agrees to the club contract for one child, for themselves and on the child's behalf. */
export async function signAgreement(_prev: AgreementState, formData: FormData): Promise<AgreementState> {
  const user = await requireParent();
  const child = formData.get("child");
  const parentName = cleanText(formData.get("parentName"), 80);
  if (typeof child !== "string" || !UUID.test(child)) return { error: "Something went wrong. Reload and try again." };
  if (formData.get("playerAgrees") !== "on") return { error: "Tick to confirm you've gone through the player responsibilities together." };
  if (formData.get("parentAgrees") !== "on") return { error: "Tick to agree to the parent responsibilities." };
  if (!parentName || parentName.split(" ").length < 2) return { error: "Type your full name to sign." };
  const [player] = await asUser(user.id, (tx) =>
    tx.query<{ first_name: string; last_name: string }>(`select first_name, last_name from players where id = $1 and id in (select my_player_ids())`, [child]),
  );
  if (!player) return { error: "Something went wrong. Reload and try again." };
  await asUser(user.id, (tx) =>
    tx.query(`select sign_agreement($1, $2, $3, $4)`, [child, CONTRACT.id, parentName, `${player.first_name} ${player.last_name}`]),
  );
  redirect("/checklist");
}

/**
 * "Ask the club to delete my account" (Player → Your data → the confirm page). Records the request once and emails the
 * club, naming the parent only. Nothing is deleted here: an admin decides what happens to the children's records.
 */
export async function askToDeleteAccount(): Promise<void> {
  const user = await requireParent();
  const created = await asUser(user.id, requestAccountDeletion);
  if (created) await tellClubAboutDeletion(user.id);
  redirect("/player/delete-account");
}

/** Emails the club about a new deletion request. Never throws: the request is on the admin overview either way. */
async function tellClubAboutDeletion(userId: string) {
  if (!canSendEmail()) return;
  try {
    const parentName = await myName(userId);
    const admins = await asSystem((tx) => tx.query<{ email: string }>(`select email from staff where role = 'admin'`));
    const to = deletionRequestRecipients(process.env, admins.map((a) => a.email));
    if (!parentName || to.length === 0) return;
    const base = await baseUrl();
    const { failed } = await sendEmails(to.map((email) => deletionRequestEmail({ to: email, parentName, link: base ? `${base}/admin` : null, appUrl: base })));
    if (failed.length) console.error(`[data request] club email not sent to ${failed.length} address(es).`);
  } catch (error) {
    console.error("[data request] club email failed:", error instanceof Error ? error.message : error);
  }
}

async function myName(userId: string): Promise<string | null> {
  const [parent] = await asUser(userId, (tx) =>
    tx.query<{ first_name: string; last_name: string }>(`select first_name, last_name from guardians where id = my_guardian_id()`),
  );
  return parent ? `${parent.first_name} ${parent.last_name}` : null;
}

async function baseUrl(): Promise<string | null> {
  const base = appUrl();
  if (base || process.env.NODE_ENV === "production") return base;
  const host = (await headers()).get("host");
  return host ? `http://${host}` : null;
}

// Player → Your details, a child's details, Add a child. Each write goes through a function from migration 0021
// that checks the row is this parent's own (`src/lib/parent/profile.ts`); the ids in the form are never trusted.

export type ProfileFormState = { error?: string; saved?: boolean };

const RELOAD = "Something went wrong. Reload and try again.";

export async function saveMyDetails(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await requireParent();
  const firstName = cleanName(formData.get("firstName"));
  const lastName = cleanName(formData.get("lastName"));
  const phoneText = cleanText(formData.get("phone"), 30);
  const phone = phoneText ? cleanPhone(phoneText) : null;
  if (!firstName || !lastName) return { error: "Add your first and last name." };
  if (phoneText && !phone) return { error: "Check your mobile number, like 07700 900123." };
  await asUser(user.id, (tx) => updateMyDetails(tx, { firstName, lastName, phone }));
  refresh();
  return { saved: true };
}

export async function saveMyChild(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await requireParent();
  const id = formData.get("child");
  if (typeof id !== "string" || !UUID.test(id)) return { error: RELOAD };
  const firstName = cleanName(formData.get("firstName"));
  const lastName = cleanName(formData.get("lastName"));
  if (!firstName || !lastName) return { error: "Add your child's first and last name." };
  const dob = checkDateOfBirth(formData.get("dateOfBirth"), firstName);
  if (!dob.ok) return { error: dob.error };
  const saved = await asUser(user.id, async (tx) => {
    if (!(await loadMyChild(tx, id))) return false;
    await updateMyChild(tx, { id, firstName, lastName, dateOfBirth: dob.dob });
    return true;
  });
  if (!saved) return { error: RELOAD };
  refresh();
  return { saved: true };
}

export type PhotoFormState = { error?: string; saved?: "added" | "removed" };

/**
 * Adds or replaces a child's photo for the coaches. Only the parent's own child, and only while photo consent is
 * yes (the database refuses otherwise too). `resized` says the browser already shrank it (2 MB cap, else 8 MB).
 */
export async function saveChildPhoto(_prev: PhotoFormState, formData: FormData): Promise<PhotoFormState> {
  const user = await requireParent();
  const id = formData.get("child");
  if (typeof id !== "string" || !UUID.test(id)) return { error: RELOAD };
  const photo = await readPhoto(formData.get("photo"), formData.get("resized") === "1");
  if (!photo.ok) return { error: photo.error };
  // Always re-encoded here (no location or camera details kept), even when the browser already shrank it.
  const clean = await cleanPhoto(photo.photo.data);
  if (!clean) return { error: "We couldn't read that photo. Try another one." };
  const error = await asUser(user.id, async (tx) => {
    const child = await loadMyChild(tx, id);
    if (!child) return RELOAD;
    if (child.photoConsent !== true) return `Turn on photo consent for ${child.firstName} to add a photo.`;
    await setMyChildPhoto(tx, id, clean);
    return null;
  });
  if (error) return { error };
  refresh();
  return { saved: "added" };
}

/** Takes a child's photo off; the file is deleted with it. */
export async function removeChildPhoto(_prev: PhotoFormState, formData: FormData): Promise<PhotoFormState> {
  const user = await requireParent();
  const id = formData.get("child");
  if (typeof id !== "string" || !UUID.test(id)) return { error: RELOAD };
  const done = await asUser(user.id, async (tx) => {
    if (!(await loadMyChild(tx, id))) return false;
    await clearMyChildPhoto(tx, id);
    return true;
  });
  if (!done) return { error: RELOAD };
  refresh();
  return { saved: "removed" };
}

/** Adds a child to the parent's own account (linked to them alone), tells the club, and opens the child on Player. */
export async function addChild(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await requireParent();
  const firstName = cleanName(formData.get("firstName"));
  const lastName = cleanName(formData.get("lastName"));
  if (!firstName || !lastName) return { error: "Add your child's first and last name." };
  const dob = checkDateOfBirth(formData.get("dateOfBirth"), firstName);
  if (!dob.ok) return { error: dob.error };
  const ageGroup = formData.get("ageGroup");
  if (!isAgeGroup(ageGroup)) return { error: `Choose ${firstName}'s group.` };
  const id = await asUser(user.id, async (tx) => {
    if (await haveChild(tx, firstName, dob.dob)) return null;
    return addMyChild(tx, { firstName, lastName, dateOfBirth: dob.dob, ageGroup });
  });
  if (!id) return { error: `${firstName} is already on your account.` };
  await tellClubAboutChild(user.id, firstName, ageGroup);
  redirect(`/player?child=${id}&added=1`);
}

/** Emails the club's admins about a child a parent added. Never throws: the child is on Families either way. */
async function tellClubAboutChild(userId: string, childName: string, group: string) {
  if (!canSendEmail()) return;
  try {
    const parentName = await myName(userId);
    const admins = await asSystem((tx) => tx.query<{ email: string }>(`select email from staff where role = 'admin'`));
    if (!parentName || admins.length === 0) return;
    const base = await baseUrl();
    const { failed } = await sendEmails(
      admins.map((a) => newChildEmail({ to: a.email, parentName, childName, group, link: base ? `${base}/admin/families` : null, appUrl: base })),
    );
    if (failed.length) console.error(`[add child] club email not sent to ${failed.length} admin(s).`);
  } catch (error) {
    console.error("[add child] club email failed:", error instanceof Error ? error.message : error);
  }
}

export type AddParentState = { error?: string; saved?: boolean; message?: string };

/** The database's refusals from `add_my_co_parent` (migration 0029), as the parent reads them. */
function coParentRefusal(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("own email")) return "That's your own email. Add the other parent or carer's email.";
  if (message.includes("too many parents")) return "A child can have up to 4 parents in the app. Ask the club to change who's on the account.";
  if (message.includes("too many today")) return "You've added a lot of parents today. Try again tomorrow, or ask the club.";
  if (message.includes("invalid email")) return "Check the email address.";
  if (message.includes("invalid name")) return "Add their first and last name.";
  return null;
}

/**
 * Player → Your family → Add the other parent: links another parent to some or all of this parent's own children
 * (found by email or added), then, after the response, emails them a sign-in link and tells the club's admins.
 */
export async function addParent(_prev: AddParentState, formData: FormData): Promise<AddParentState> {
  const user = await requireParent();
  const firstName = cleanName(formData.get("firstName"));
  const lastName = cleanName(formData.get("lastName"));
  const emailText = cleanText(formData.get("email"), 254);
  const email = normaliseEmail(emailText);
  const phoneText = cleanText(formData.get("phone"), 30);
  const phone = phoneText ? cleanPhone(phoneText) : null;
  const children = formData.getAll("child").filter((c): c is string => typeof c === "string" && UUID.test(c));
  if (!firstName || !lastName) return { error: "Add their first and last name." };
  if (!emailText) return { error: "Add their email address. It's how they sign in." };
  if (!email) return { error: "Check the email address." };
  if (phoneText && !phone) return { error: "Check their mobile number, like 07700 900123." };
  if (children.length === 0) return { error: "Choose at least one child." };

  let outcome: { result: Awaited<ReturnType<typeof addMyCoParent>>; names: string[]; me: string } | { error: string };
  try {
    outcome = await asUser(user.id, async (tx) => {
      const names = await tx.query<{ first_name: string }>(
        `select first_name from players where id = any($1::uuid[]) and id in (select my_player_ids()) order by date_of_birth nulls last, first_name`,
        [children],
      );
      if (names.length !== new Set(children).size) return { error: RELOAD };
      const [me] = await tx.query<{ first_name: string; last_name: string }>(`select first_name, last_name from guardians where id = my_guardian_id()`);
      const result = await addMyCoParent(tx, { firstName, lastName, email, phone, children: [...new Set(children)] });
      return { result, names: names.map((n) => n.first_name), me: `${me.first_name} ${me.last_name}`.trim() };
    });
  } catch (error) {
    const refusal = coParentRefusal(error);
    if (refusal) return { error: refusal };
    throw error;
  }
  if ("error" in outcome) return { error: outcome.error };
  const { result, names, me } = outcome;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  if (result.linked === 0) return { error: `${firstName} is already a parent of ${list} in the app.` };

  const base = await baseUrl();
  if (canSendEmail()) {
    after(() => enqueue("add parent invite", () => sendCoParentInvite({ guardianId: result.guardianId, addedBy: me, children: names, baseUrl: base })));
  }
  refresh();
  return {
    saved: true,
    message: canSendEmail()
      ? `${firstName} has been added to ${list}. We're emailing them a link to sign in.`
      : `${firstName} has been added to ${list}. They can sign in with ${email}.`,
  };
}
