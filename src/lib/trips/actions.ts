"use server";

import { refresh } from "next/cache";
import { coachLimit, requireParent, requireStaff } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { readLondonDateTime } from "../incidents/data";
import { parseFee } from "../settings";
import { canManageSquad } from "../squads/squads";
import { cleanPhone, cleanText } from "../validate";
import { deleteTrip, giveTripConsent, saveTrip } from "./data";

export type TripFormState = { error?: string; saved?: boolean; message?: string };
const uuid = (v: FormDataEntryValue | null) => (typeof v === "string" && UUID.test(v) ? v : null);

async function sessionGroups(userId: string, sessionId: string): Promise<string[] | null> {
  const [row] = await asUser(userId, (tx) => tx.query<{ g: string[] }>(`select age_groups::text[] as g from sessions where id = $1`, [sessionId]));
  return row?.g ?? null;
}

/** Staff: add or change a session's trip details. A group coach only for sessions whose groups are all theirs. */
export async function saveTripAction(_prev: TripFormState, formData: FormData): Promise<TripFormState> {
  const user = await requireStaff();
  const session = uuid(formData.get("session"));
  if (!session) return { error: "That session wasn't found." };
  const groups = await sessionGroups(user.id, session);
  if (!groups || !canManageSquad(groups, coachLimit(user.staff))) return { error: "Only an admin can change this trip." };
  const meetAt = readLondonDateTime(formData.get("meetAt"));
  if (!meetAt) return { error: "Add when and where to meet." };
  const meetPoint = cleanText(formData.get("meetPoint"), 200);
  if (!meetPoint) return { error: "Add where to meet." };
  const returnText = formData.get("returnAt");
  const returnAt = typeof returnText === "string" && returnText ? readLondonDateTime(returnText) : null;
  if (typeof returnText === "string" && returnText && !returnAt) return { error: "Check the time they'll be back." };
  if (returnAt && returnAt <= meetAt) return { error: "The time they're back must be after the meeting time." };
  const costText = formData.get("cost");
  const costPence = typeof costText === "string" && costText.trim() ? parseFee(costText) : null;
  if (typeof costText === "string" && costText.trim() && costPence === null) return { error: "Write the cost in pounds, like 5 or 4.50, or leave it blank." };
  await asUser(user.id, (tx) =>
    saveTrip(
      tx,
      session,
      { meetAt, meetPoint, returnAt, transport: cleanText(formData.get("transport"), 200) || null, costPence, notes: cleanText(formData.get("notes"), 1000) || null },
      user.staff.id,
    ),
  );
  refresh();
  return { saved: true, message: "Saved. Parents can now say yes or no in the app." };
}

export async function deleteTripAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const session = uuid(formData.get("session"));
  if (!session || formData.get("confirm") !== "yes") return;
  const groups = await sessionGroups(user.id, session);
  if (!groups || !canManageSquad(groups, coachLimit(user.staff))) return;
  await asUser(user.id, (tx) => deleteTrip(tx, session));
  refresh();
}

/** A parent answers for one child: yes or no, a number for the day, anything the coaches should know. */
export async function giveTripConsentAction(_prev: TripFormState, formData: FormData): Promise<TripFormState> {
  const user = await requireParent();
  const session = uuid(formData.get("session"));
  const child = uuid(formData.get("child"));
  const answer = formData.get("consent");
  if (!session || !child) return { error: "That trip wasn't found." };
  if (answer !== "yes" && answer !== "no") return { error: "Choose yes or no." };
  const phoneText = formData.get("phone");
  const phone = typeof phoneText === "string" && phoneText.trim() ? cleanPhone(phoneText) : null;
  if (answer === "yes" && !phone) return { error: "Add a mobile number the coaches can reach you on during the trip." };
  const note = cleanText(formData.get("note"), 300) || null;
  try {
    await asUser(user.id, (tx) => giveTripConsent(tx, session, child, answer === "yes", phone, note));
  } catch {
    return { error: "This trip can't be answered any more." };
  }
  refresh();
  return { saved: true };
}
