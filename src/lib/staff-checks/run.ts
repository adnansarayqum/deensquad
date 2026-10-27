import { inQuietHours } from "../chase/ladder";
import { appUrl } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { staffCheckEmail } from "../email/templates";
import { checkName, dayText, londonIsoDay } from "./checks";
import { dueCheckReminders, markCheckReminded } from "./data";

/**
 * Hourly (the cron): for each check running out within 60 days (or already run out) that hasn't had its email, emails
 * the member of staff and every admin once (never in quiet hours). A check is marked only when someone got it, so a
 * failed send goes next hour; changing its expiry date clears the mark. Never throws.
 */
export async function runStaffCheckReminders(now = new Date()): Promise<{ checks: number; sent: number }> {
  try {
    if (inQuietHours(now) || !canSendEmail()) return { checks: 0, sent: 0 };
    const today = londonIsoDay(now);
    const base = appUrl();
    const [due, admins] = await asSystem(async (tx) => [
      await dueCheckReminders(tx, today),
      await tx.query<{ email: string }>(`select email from staff where role = 'admin' order by created_at`),
    ] as const);
    if (due.length === 0) return { checks: 0, sent: 0 };
    const link = base ? `${base}/admin/staff#checks` : null;
    let sent = 0;
    const done: string[] = [];
    for (const d of due) {
      const check = checkName({ kind: d.kind, title: d.title });
      const expired = d.expiresOn < today;
      const to = [
        { email: d.staffEmail, forThem: true },
        ...admins.filter((a) => a.email.toLowerCase() !== d.staffEmail.toLowerCase()).map((a) => ({ email: a.email, forThem: false })),
      ];
      const report = await sendEmails(
        to.map((r) => ({
          ...staffCheckEmail({ to: r.email, forThem: r.forThem, staffName: d.staffName, check, when: dayText(d.expiresOn), expired, link: r.forThem ? null : link, appUrl: base }),
          idempotencyKey: `staff-check:${d.id}:${d.expiresOn}:${r.email.toLowerCase()}`,
        })),
      );
      if (report.sent.length > 0) {
        done.push(d.id);
        sent += report.sent.length;
      }
    }
    await asSystem((tx) => markCheckReminded(tx, done, now));
    return { checks: done.length, sent };
  } catch (error) {
    console.error("[staff checks] reminder failed:", error instanceof Error ? error.message : error);
    return { checks: 0, sent: 0 };
  }
}
