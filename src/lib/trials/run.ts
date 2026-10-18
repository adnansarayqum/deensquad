import { inQuietHours } from "../chase/ladder";
import { appUrl } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { trialFollowUpEmail } from "../email/templates";
import { anonymiseOldTrials, dueFollowUps, markFollowUpSent } from "./data";

/**
 * Hourly (the cron): emails families whose child came to a trial a link to join (never in quiet hours; marked only
 * for those sent, so a failed one goes next hour), and removes the personal details of bookings over 180 days old.
 * Never throws.
 */
export async function runTrialFollowUps(now = new Date()): Promise<{ sent: number; anonymised: number }> {
  let sent = 0;
  let anonymised = 0;
  try {
    anonymised = await asSystem((tx) => anonymiseOldTrials(tx, now));
    const base = appUrl();
    if (!inQuietHours(now) && canSendEmail() && base) {
      const due = await asSystem((tx) => dueFollowUps(tx, now));
      if (due.length) {
        const { failed } = await sendEmails(
          due.map((d) => ({
            ...trialFollowUpEmail({ to: d.email, parentFirstName: d.parent_first_name, childFirstName: d.child_first_name, joinUrl: `${base}/sign-up`, appUrl: base }),
            idempotencyKey: `trial-follow-up:${d.id}`,
          })),
        );
        const failedTo = new Set(failed.map((f) => f.to));
        const done = due.filter((d) => !failedTo.has(d.email)).map((d) => d.id);
        await asSystem((tx) => markFollowUpSent(tx, done));
        sent = done.length;
      }
    }
  } catch (error) {
    console.error("[trials] follow-up failed:", error instanceof Error ? error.message : error);
  }
  return { sent, anonymised };
}
