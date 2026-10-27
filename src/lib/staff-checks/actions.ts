"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { cleanText } from "../validate";
import { isCheckKind, readDay } from "./checks";
import { deleteStaffCheck, saveStaffCheck } from "./data";

export type CheckFormState = { error?: string; saved?: boolean };
const uuid = (v: FormDataEntryValue | null) => (typeof v === "string" && UUID.test(v) ? v : null);

/** Admin → Staff → a person's checks: add one, or change one (`check` = its id). */
export async function saveStaffCheckAction(_prev: CheckFormState, formData: FormData): Promise<CheckFormState> {
  const user = await requireAdmin();
  const staff = uuid(formData.get("staff"));
  if (!staff) return { error: "That member of staff wasn't found." };
  const kind = formData.get("kind");
  if (!isCheckKind(kind)) return { error: "Choose what kind of check it is." };
  const title = cleanText(formData.get("title"), 80);
  if (kind === "other" && !title) return { error: "Say what it is, like Mental health first aid." };
  const reference = cleanText(formData.get("reference"), 40);
  const issued = readDay(formData.get("issuedOn"));
  const expires = readDay(formData.get("expiresOn"));
  if (!issued.ok) return { error: "Check the date it was issued." };
  if (!expires.ok) return { error: "Check the date it runs out." };
  if (issued.day && expires.day && expires.day <= issued.day) return { error: "The date it runs out must be after the date it was issued." };
  await asUser(user.id, (tx) =>
    saveStaffCheck(tx, staff, { kind, title: title || null, reference: reference || null, issuedOn: issued.day, expiresOn: expires.day }, user.staff.id, uuid(formData.get("check"))),
  );
  refresh();
  return { saved: true };
}

export async function deleteStaffCheckAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const staff = uuid(formData.get("staff"));
  const check = uuid(formData.get("check"));
  if (!staff || !check || formData.get("confirm") !== "yes") return;
  await asUser(user.id, (tx) => deleteStaffCheck(tx, staff, check));
  refresh();
}
