import "server-only";

import { appUrl } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { progressReportEmail } from "../email/templates";
import { monthOnly } from "./ratings";

/**
 * Emails a child's parents that a progress report was published. Called (after the response) only for a report
 * `saveReport` marked as emailed, i.e. published for the first time while progress is on. Never throws; if no email
 * went, the mark is cleared so publishing again can retry.
 */
export async function notifyReportPublished(reportId: string): Promise<void> {
  try {
    if (!canSendEmail()) return;
    const rows = await asSystem((tx) =>
      tx.query<{ email: string; parent: string; child: string; player_id: string; month: string; shown: boolean }>(
        `select g.email, g.first_name as parent, p.first_name as child, p.id as player_id, r.month::text as month, progress_visible() as shown
         from progress_reports r join players p on p.id = r.player_id
         join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id
         where r.id = $1 and r.published_at is not null and g.email is not null`,
        [reportId],
      ),
    );
    if (rows.length === 0 || !rows[0].shown) return;
    const base = appUrl();
    const { sent, failed } = await sendEmails(
      rows.map((r) =>
        progressReportEmail({
          to: r.email,
          firstName: r.parent,
          childName: r.child,
          month: monthOnly(r.month),
          link: base ? `${base}/player?child=${r.player_id}` : null,
          appUrl: base,
        }),
      ),
    );
    if (failed.length) console.error(`[progress] report email not sent to ${failed.length} parent(s).`);
    if (sent.length === 0) await asSystem((tx) => tx.query(`update progress_reports set emailed_at = null where id = $1`, [reportId]));
  } catch (error) {
    console.error("[progress] report email failed:", error instanceof Error ? error.message : error);
  }
}
