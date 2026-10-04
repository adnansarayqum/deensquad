"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Availability } from "./domain";
import {
  DEMO_COOKIE,
  EMPTY_STATE,
  decodeState,
  encodeState,
  withAvailability,
  withCheckIn,
  withDone,
  withPhotoConsent,
  withRead,
  type DemoState,
} from "./demo-state";
import { knownIds } from "./views";

// Server Actions for demo mode. Each one validates its input against the demo data,
// updates the family's cookie, and lets Next re-render the current page.
// Setting a cookie in a Server Action re-renders the route, so no revalidate call is needed.

async function update(change: (state: DemoState) => DemoState) {
  const store = await cookies();
  const next = change(decodeState(store.get(DEMO_COOKIE)?.value));
  store.set(DEMO_COOKIE, encodeState(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function acknowledgeAnnouncement(announcementId: string) {
  if (!knownIds(new Date()).announcements.has(announcementId)) return;
  await update((s) => withRead(s, announcementId));
}

export async function setAvailability(sessionId: string, answer: Availability) {
  if (answer !== "coming" && answer !== "away") return;
  if (!knownIds(new Date()).sessions.has(sessionId)) return;
  await update((s) => withAvailability(s, sessionId, answer));
}

export async function confirmPaymentPlan() {
  await update((s) => withDone(s, "payment-plan"));
  redirect("/checklist");
}

export async function savePhotoConsent(formData: FormData) {
  const answer = formData.get("consent");
  if (answer !== "yes" && answer !== "no") return;
  await update((s) => withPhotoConsent(s, answer));
  redirect("/checklist");
}

export async function checkInPlayer(playerId: string) {
  if (!knownIds(new Date()).players.has(playerId)) return;
  await update((s) => withCheckIn(s, playerId));
}

export async function resetDemo() {
  await update(() => EMPTY_STATE);
  redirect("/news");
}
