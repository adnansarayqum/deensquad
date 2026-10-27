import { appUrl } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { wellbeingAlertEmail } from "../email/templates";
import { checkinForAlert, markAlerted } from "./data";

/**
 * Emails every admin about check-ins that need a look ("not great" or with a note) and haven't been alerted: right
 * after a parent sends one (`after()`), and hourly from the cron as the retry. Marked only when an email went. The
 * email names the child and group only. Never throws.
 */
export async function runWellbeingAlerts(): Promise<{ alerted: number }> {
  try {
    if (!canSendEmail()) return { alerted: 0 };
    const base = appUrl();
    const [ids, admins] = await asSystem(async (tx) => [
      await tx.query<{ id: string }>(
        `select id from wellbeing_checkins where alerted_at is null and followed_up_at is null and (mood = 'low' or note is not null) and created_at > now() - interval '14 days' order by created_at limit 50`,
      ),
      await tx.query<{ email: string }>(`select email from staff where role = 'admin' order by created_at`),
    ] as const);
    if (ids.length === 0 || admins.length === 0) return { alerted: 0 };
    let alerted = 0;
    for (const { id } of ids) {
      const c = await asSystem((tx) => checkinForAlert(tx, id));
      if (!c?.needsLook) continue;
      const report = await sendEmails(
        admins.map((a) => ({
          ...wellbeingAlertEmail({ to: a.email, childFirstName: c.firstName, group: c.group, link: base ? `${base}/admin/wellbeing` : null, appUrl: base }),
          idempotencyKey: `wellbeing:${id}:${a.email.toLowerCase()}`,
        })),
      );
      if (report.sent.length > 0) {
        await asSystem((tx) => markAlerted(tx, id));
        alerted++;
      }
    }
    return { alerted };
  } catch (error) {
    console.error("[wellbeing] alert failed:", error instanceof Error ? error.message : error);
    return { alerted: 0 };
  }
}
