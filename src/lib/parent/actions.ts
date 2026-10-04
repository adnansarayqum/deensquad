"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireParent } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import type { Availability } from "../domain";
import { cleanPhone, cleanText } from "../validate";

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
  await asUser(user.id, (tx) =>
    tx.query(
      `insert into availability (session_id, player_id, answer, answered_by, answered_at)
       select s.id, $2, $3::availability_answer, my_guardian_id(), now() from sessions s
       where s.id = $1 and s.ends_at > now() and s.cancelled_at is null and $2::uuid in (select my_player_ids())
       on conflict (session_id, player_id) do update
         set answer = excluded.answer, answered_by = excluded.answered_by, answered_at = excluded.answered_at`,
      [sessionId, playerId, answer],
    ),
  );
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
