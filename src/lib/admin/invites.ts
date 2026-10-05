import "server-only";

import { issueSignIn } from "../auth/service";
import { appUrl } from "../config";
import { asSystem } from "../db";
import { sendEmails, type Email } from "../email/send";
import { inviteEmail } from "../email/templates";

/**
 * Emails each parent a week-long sign-in link. With `guardianIds`, only those parents
 * (a resend); otherwise everyone with an email who hasn't signed in or been invited yet.
 * Runs as the system because it writes sign-in requests; callers check the admin first.
 * Only parents whose email went are marked invited, so trying again reaches just the rest.
 */
export async function sendInvites(opts: { guardianIds?: string[]; baseUrl?: string | null }): Promise<{ sent: number; failed: number }> {
  const base = opts.baseUrl ?? appUrl();
  if (!base) throw new Error("Set APP_URL so invite links point at the app.");
  const now = new Date();

  const invites = await asSystem(async (tx) => {
    const targets = await tx.query<{ id: string; first_name: string; email: string; children: string[] }>(
      `select g.id, g.first_name, g.email, array_agg(p.first_name order by p.date_of_birth nulls last, p.first_name) as children
       from guardians g
       join player_guardians pg on pg.guardian_id = g.id
       join players p on p.id = pg.player_id
       where g.email is not null
         and ${opts.guardianIds ? "g.id = any($1::uuid[])" : "g.auth_user_id is null and g.invited_at is null"}
       group by g.id`,
      opts.guardianIds ? [opts.guardianIds] : [],
    );
    const out: { guardianId: string; requestId: string; email: Email }[] = [];
    for (const t of targets) {
      const issued = await issueSignIn(tx, { email: t.email.toLowerCase(), ip: null, now, purpose: "invite" });
      if (!issued.ok) continue;
      out.push({
        guardianId: t.id,
        requestId: issued.request.requestId,
        email: inviteEmail({ to: t.email, firstName: t.first_name, children: t.children, link: `${base}/sign-in/link?token=${issued.request.token}`, appUrl: base }),
      });
    }
    return out;
  });
  if (invites.length === 0) return { sent: 0, failed: 0 };

  // Mark parents as invited only once their email has gone; links that never went out are dropped.
  const report = await sendEmails(invites.map((i) => i.email));
  const went = new Set(report.sent);
  const sent = invites.filter((i) => went.has(i.email));
  const failed = invites.filter((i) => !went.has(i.email));
  await asSystem(async (tx) => {
    if (sent.length) await tx.query(`update guardians set invited_at = $2 where id = any($1::uuid[])`, [sent.map((i) => i.guardianId), now]);
    if (failed.length) await tx.query(`delete from auth.sign_in_requests where id = any($1::uuid[])`, [failed.map((i) => i.requestId)]);
  });
  return { sent: sent.length, failed: failed.length };
}
