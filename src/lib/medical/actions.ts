"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireParent } from "../auth/session";
import { UUID } from "../auth/tokens";
import { asUser } from "../db";
import { loadMyChild } from "../parent/profile";
import { cleanMedicalText, clearMyChildMedical, loadMyChildMedical, MEDICAL_FIELD_MAX, MEDICAL_LABELS, setMyChildMedical, type MedicalText } from "./data";

// A parent's own child's medical and additional needs (Player → a child's details → Medical and additional needs).
// The child id in the form is never trusted: the database functions check the child is the parent's own. Nothing
// here logs what was typed.

export type MedicalFormState = { error?: string; saved?: "saved" | "removed" };

const RELOAD = "Something went wrong. Reload and try again.";

export async function saveChildMedical(_prev: MedicalFormState, formData: FormData): Promise<MedicalFormState> {
  const user = await requireParent();
  const id = formData.get("child");
  if (typeof id !== "string" || !UUID.test(id)) return { error: RELOAD };
  const text: MedicalText = {
    conditions: cleanMedicalText(formData.get("conditions")),
    allergies: cleanMedicalText(formData.get("allergies")),
    medication: cleanMedicalText(formData.get("medication")),
    howToHelp: cleanMedicalText(formData.get("howToHelp")),
  };
  for (const [field, value] of Object.entries(text) as [keyof MedicalText, string | null][]) {
    if (value && value.length > MEDICAL_FIELD_MAX) {
      return { error: `Keep "${MEDICAL_LABELS[field]}" to ${MEDICAL_FIELD_MAX} characters (it's ${value.length}).` };
    }
  }
  const consent = formData.get("consent") === "yes";
  const blank = Object.values(text).every((v) => v === null);
  const result = await asUser(user.id, async (tx): Promise<MedicalFormState> => {
    const child = await loadMyChild(tx, id);
    if (!child) return { error: RELOAD };
    const had = Boolean(await loadMyChildMedical(tx, id));
    if (blank) {
      if (!had) return { error: `Fill in at least one box, or leave this page if there's nothing the coaches need to know about ${child.firstName}.` };
      await clearMyChildMedical(tx, id);
      return { saved: "removed" };
    }
    if (!consent) return { error: `Tick the box to agree to the coaches seeing this, or leave it blank.` };
    await setMyChildMedical(tx, id, text, true);
    return { saved: "saved" };
  });
  if (result.saved) refresh();
  return result;
}

export async function removeChildMedical(_prev: MedicalFormState, formData: FormData): Promise<MedicalFormState> {
  const user = await requireParent();
  const id = formData.get("child");
  if (typeof id !== "string" || !UUID.test(id)) return { error: RELOAD };
  if (formData.get("confirm") !== "yes") return { error: "Tick the box to confirm, then tap Remove." };
  const done = await asUser(user.id, async (tx) => {
    if (!(await loadMyChild(tx, id))) return false;
    await clearMyChildMedical(tx, id);
    return true;
  });
  if (!done) return { error: RELOAD };
  // The Remove card goes with what it removed, so the page itself says so.
  redirect(`/player/child/${id}/medical?removed=1`);
}
