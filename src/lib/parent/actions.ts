"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireParent } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { CONTRACT } from "../documents/contract";
import type { Availability } from "../domain";
import { cleanPhone, cleanText } from "../validate";
import { saveAnswer } from "./data";

// Parent Server Actions. Each checks the session, validates its input, then writes as that parent,
// so row level security (and the database functions) decide whether the write is allowed.

export async function acknowledgeAnnouncement(announcementId: string): Promise<void> {
  const user = await requireParent();
  if (!UUID.test(announcementId)) return;
  await asUser(user.id, (tx) =>
    tx.query(
      `insert into announcement_reads (announcement_id, guardian_id) values ($1, my_guardian_id()) on conflict do nothing`,
      [announcementId],
    ),
  );
  refresh();
}

export async function setAvailability(sessionId: string, playerId: string, answer: Availability): Promise<void> {
  const user = await requireParent();
  if (!UUID.test(sessionId) || !UUID.test(playerId) || (answer !== "coming" && answer !== "away")) return;
  await asUser(user.id, (tx) => saveAnswer(tx, sessionId, playerId, answer));
  refresh();
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

export async function savePhotoConsent(formData: FormData): Promise<void> {
  const user = await requireParent();
  const child = formData.get("child");
  const answer = formData.get("consent");
  if (typeof child !== "string" || !UUID.test(child) || (answer !== "yes" && answer !== "no")) return;
  await asUser(user.id, (tx) => tx.query(`select set_photo_consent($1, $2)`, [child, answer === "yes"]));
  redirect("/checklist");
}

export async function reportPaymentSetup(formData: FormData): Promise<void> {
  const user = await requireParent();
  const child = formData.get("child");
  if (typeof child !== "string" || !UUID.test(child)) return;
  await asUser(user.id, (tx) => tx.query(`select report_payment_setup($1)`, [child]));
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
