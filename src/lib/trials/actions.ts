"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { coachLimit, requireStaff } from "../auth/session";
import { clientIpFrom } from "../auth/ip";
import { normaliseEmail, UUID } from "../auth/tokens";
import { enqueue } from "../background";
import { windowCounter } from "../calendar/feed";
import { appUrl } from "../config";
import { clock, shortDay } from "../dates";
import { asSystem, asUser } from "../db";
import { isAgeGroup } from "../domain";
import { canSendEmail, sendEmails } from "../email/send";
import { trialAdminEmail, trialBookedEmail } from "../email/templates";
import { checkDateOfBirth, cleanName } from "../parent/profile";
import { poundsText, sessionFeePence } from "../settings";
import { cleanPhone } from "../validate";
import { bookTrial, cancelTrial, setTrialArrived, type TrialSession } from "./data";

// The public trial booking (/trial, no sign-in) and the staff's Arrived and Cancel. Bookings are written with asSystem
// by this action only; anyone can post it, so it's limited per address and club-wide, and a hidden field catches bots.

const perAddress = windowCounter(10);
const clubWide = windowCounter(60);

export type TrialFormState = { error?: string };

export async function bookTrialAction(_prev: TrialFormState, formData: FormData): Promise<TrialFormState> {
  // A field people never see: a bot that fills everything in gets the same screen as a booking, and nothing is kept.
  if (String(formData.get("website") ?? "")) redirect("/trial?booked=1");
  const h = await headers();
  const ip = clientIpFrom(h) ?? "unknown";
  if (!perAddress.hit(ip) || !clubWide.hit("club")) return { error: "A lot of trials have been booked in the last hour. Try again later, or contact the club." };

  const parentFirstName = cleanName(formData.get("parentFirstName"));
  const parentLastName = cleanName(formData.get("parentLastName"));
  const email = normaliseEmail(formData.get("email"));
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? cleanPhone(rawPhone) : null;
  const childFirstName = cleanName(formData.get("childFirstName"));
  const childLastName = cleanName(formData.get("childLastName"));
  const ageGroup = formData.get("ageGroup");
  const sessionId = formData.get("session");
  if (!parentFirstName || !parentLastName) return { error: "Add your first and last name." };
  if (!email) return { error: "Add your email address, so we can send you the details." };
  if (rawPhone && !phone) return { error: "That phone number doesn't look right. Type it like 07700 900123." };
  if (!childFirstName || !childLastName) return { error: "Add your child's first and last name." };
  const dob = checkDateOfBirth(formData.get("dateOfBirth"), childFirstName);
  if (!dob.ok) return { error: dob.error };
  if (!isAgeGroup(ageGroup)) return { error: `Choose ${childFirstName}'s group.` };
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) return { error: "Choose a session." };
  if (formData.get("privacy") !== "yes") return { error: "Tick the box to say you've read how the club uses your information." };

  const now = new Date();
  const result = await asSystem(async (tx) => ({
    booked: await bookTrial(
      tx,
      { sessionId, parentFirstName, parentLastName, email, phone, childFirstName, childLastName, dateOfBirth: dob.dob, ageGroup },
      now,
    ),
    fee: poundsText(await sessionFeePence(tx)),
  }));
  if (!result.booked.ok) {
    const reason = result.booked.reason;
    return {
      error:
        reason === "already"
          ? `${childFirstName} already has a trial booked. If you need to change it, reply to the email we sent or contact the club.`
          : reason === "group"
            ? `That session isn't for the ${ageGroup} group. Choose one that is.`
            : "That session can't be booked any more. Choose another.",
    };
  }
  const session = result.booked.session;
  const base = appUrl() ?? (process.env.NODE_ENV === "production" ? null : `http://${h.get("host")}`);
  after(() =>
    enqueue("trial emails", () => sendTrialEmails({ email, parentFirstName, childFirstName, ageGroup, session, fee: result.fee, base })),
  );
  redirect("/trial?booked=1");
}

async function sendTrialEmails(o: { email: string; parentFirstName: string; childFirstName: string; ageGroup: string; session: TrialSession; fee: string; base: string | null }) {
  if (!canSendEmail()) return;
  const when = `${shortDay(o.session.startsAt)} ${clock(o.session.startsAt)}`;
  const admins = await asSystem((tx) => tx.query<{ email: string }>(`select email from staff where role = 'admin'`));
  const { failed } = await sendEmails([
    trialBookedEmail({ to: o.email, parentFirstName: o.parentFirstName, childFirstName: o.childFirstName, session: o.session.title, when, venue: o.session.venue, fee: o.fee, appUrl: o.base }),
    ...admins.map((a) =>
      trialAdminEmail({ to: a.email, childFirstName: o.childFirstName, group: o.ageGroup, session: o.session.title, when, link: o.base ? `${o.base}/admin/trials` : null, appUrl: o.base }),
    ),
  ]);
  if (failed.length) console.error(`[trial] ${failed.length} email(s) not sent.`);
}

/** Register → Trials: the child has arrived (or undo). Only on the session's day. */
export async function markTrialArrived(sessionId: string, trialId: string, arrived: boolean): Promise<{ error?: string }> {
  const user = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(trialId)) return { error: "That didn't save. Reload the page and try again." };
  const result = await asUser(user.id, (tx) => setTrialArrived(tx, sessionId, trialId, arrived, new Date()));
  refresh();
  return result;
}

/** Admin → Trials: cancel a booking (a plain form with a ticked confirm). */
export async function cancelTrialAction(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const id = formData.get("trial");
  if (typeof id !== "string" || !UUID.test(id) || formData.get("confirm") !== "yes") redirect("/admin/trials?cancel=confirm");
  const done = await asUser(user.id, (tx) => cancelTrial(tx, id, coachLimit(user.staff)));
  redirect(done ? "/admin/trials?cancelled=1" : "/admin/trials");
}
