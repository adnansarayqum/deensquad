"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { requireAdmin, requireParent } from "../auth/session";
import { UUID } from "../auth/tokens";
import { enqueue } from "../background";
import { asUser } from "../db";
import { cleanBody } from "../validate";
import { giveCheckin, isMood, markFollowedUp, WELLBEING_NOTE_MAX } from "./data";
import { runWellbeingAlerts } from "./run";

export type CheckinState = { error?: string; saved?: boolean; message?: string };
const uuid = (v: FormDataEntryValue | null) => (typeof v === "string" && UUID.test(v) ? v : null);

/** A parent's check-in for one child: how they're feeling, an optional private note, consent ticked. */
export async function giveCheckinAction(_prev: CheckinState, formData: FormData): Promise<CheckinState> {
  const user = await requireParent();
  const child = uuid(formData.get("child"));
  const mood = formData.get("mood");
  if (!child) return { error: "That child wasn't found." };
  if (!isMood(mood)) return { error: "Choose how they're feeling." };
  const raw = formData.get("note");
  if (typeof raw === "string" && raw.trim().length > WELLBEING_NOTE_MAX) return { error: `Keep the note under ${WELLBEING_NOTE_MAX} characters.` };
  const note = cleanBody(raw, WELLBEING_NOTE_MAX) || null;
  if (formData.get("consent") !== "yes") return { error: "Tick the box to say the club's admins may see this." };
  try {
    await asUser(user.id, (tx) => giveCheckin(tx, child, mood, note, true));
  } catch {
    return { error: "That didn't save. Try again." };
  }
  if (mood === "low" || note) after(() => enqueue("wellbeing alert", () => runWellbeingAlerts().then(() => undefined)));
  refresh();
  return {
    saved: true,
    message: mood === "low" || note ? "Thank you. The club's admins will see this and may be in touch." : "Thank you for letting us know.",
  };
}

/** Admins: mark a check-in as followed up (it leaves the list to look at). */
export async function followUpCheckinAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = uuid(formData.get("id"));
  if (!id) return;
  await asUser(user.id, (tx) => markFollowedUp(tx, id, user.staff.id));
  refresh();
}
