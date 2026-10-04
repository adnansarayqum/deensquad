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
 */
export async function sendInvites(opts: { guardianIds?: string[]; baseUrl?: string | null }): Promise<{ sent: number }> {
  const base = opts.baseUrl ?? appUrl();
  if (!base) throw new Error("Set APP_URL so invite links point at the app.");
  const now = new Date();

  const { emails, ids } = await asSystem(async (tx) => {
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
    const out: Email[] = [];
    const sentTo: string[] = [];
    for (const t of targets) {
      const issued = await issueSignIn(tx, { email: t.email.toLowerCase(), ip: null, now, purpose: "invite" });
      if (!issued.ok) continue;
      out.push(inviteEmail({ to: t.email, firstName: t.first_name, children: t.children, link: `${base}/sign-in/link?token=${issued.request.token}`, appUrl: base }));
      sentTo.push(t.id);
    }
    return { emails: out, ids: sentTo };
  });

  // Mark parents as invited only once their email has gone.
  await sendEmails(emails);
  if (ids.length) await asSystem((tx) => tx.query(`update guardians set invited_at = $2 where id = any($1::uuid[])`, [ids, now]));
  return { sent: emails.length };
}
