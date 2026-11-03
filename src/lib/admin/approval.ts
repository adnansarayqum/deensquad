import { appUrl } from "../config";
import { asSystem } from "../db";
import type { Queryable } from "../db/types";
import { groupPlural } from "../domain";
import { canSendEmail, sendEmails } from "../email/send";
import { childApprovedEmail } from "../email/templates";

// Children a parent added (self sign-up, Add a child) wait for an admin's approval before their family sees the
// group's news, sessions, plans and photos (migration 0047; the owner's decision after the security review).

/** Approves the child as this admin. Returns false when there was nothing to approve (already approved, or gone). */
export async function approve(tx: Queryable, childId: string, staffId: string): Promise<boolean> {
  const rows = await tx.query(`update players set approved_at = now(), approved_by = $2 where id = $1 and approved_at is null returning 1`, [childId, staffId]);
  return rows.length > 0;
}

/** Emails the child's parents that they can now see the group's news and sessions. Never throws. */
export async function tellParentsApproved(childId: string): Promise<number> {
  try {
    const base = appUrl();
    if (!base || !canSendEmail()) return 0;
    const rows = await asSystem((tx) =>
      tx.query<{ email: string; first_name: string; child: string; age_group: string }>(
        `select g.email, g.first_name, p.first_name as child, p.age_group::text as age_group
         from players p join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id
         where p.id = $1 and g.email is not null`,
        [childId],
      ),
    );
    if (rows.length === 0) return 0;
    const report = await sendEmails(
      rows.map((r) => ({
        ...childApprovedEmail({ to: r.email, firstName: r.first_name, childFirstName: r.child, group: groupPlural(r.age_group), link: `${base}/news`, appUrl: base }),
        idempotencyKey: `child-approved:${childId}:${r.email.toLowerCase()}`,
      })),
    );
    if (report.failed.length) console.error(`[approve] email not sent to ${report.failed.length} parent(s).`);
    return report.sent.length;
  } catch (error) {
    console.error("[approve] email failed:", error instanceof Error ? error.message : error);
    return 0;
  }
}
