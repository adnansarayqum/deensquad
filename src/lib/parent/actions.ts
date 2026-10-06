"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireParent } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { CONTRACT } from "../documents/contract";
import type { Availability } from "../domain";
import { cleanPhone, cleanText } from "../validate";
import { teamFeePayUrl } from "../config";
import { reportFamilyPayment, saveAnswer } from "./data";

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

export type ContactFormState = { error?: string; saved?: boolean };

export async function addEmergencyContact(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const user = await requireParent();
  const childIds = formData.getAll("child").filter((v): v is string => typeof v === "string" && UUID.test(v));
  const name = cleanText(formData.get("name"), 80);
  const phone = cleanPhone(formData.get("phone"));
  const relationship = cleanText(formData.get("relationship"), 40);
  if (childIds.length === 0) return { error: "Choose which child this contact is for." };
  if (!name) return { error: "Add the contact's name." };
  if (!phone) return { error: "Add a phone number we can call, like 07700 900123." };
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
