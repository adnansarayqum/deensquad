import "server-only";

import { issueSignIn } from "../auth/service";
import { appUrl } from "../config";
import { asSystem } from "../db";
import { AGE_GROUPS } from "../domain";
import { sendEmails, type Email } from "../email/send";
import { coParentAddedEmail, coParentInviteEmail, inviteEmail } from "../email/templates";
import { UNINVITED, familyWhere, type FamilyFilter } from "./data";

/**
 * Emails each parent a week-long sign-in link. With `guardianIds`, only those parents
 * (a resend); otherwise everyone with an email who hasn't signed in or been invited yet and has
 * a child in the Families list as filtered by `filter` (the whole club when it's left out).
 * Runs as the system because it writes sign-in requests; callers check the admin first.
 * Only parents whose email went are marked invited, so trying again reaches just the rest.
 */
export async function sendInvites(opts: {
  guardianIds?: string[];
  filter?: FamilyFilter;
  baseUrl?: string | null;
}): Promise<{ sent: number; failed: number }> {
  const base = opts.baseUrl ?? appUrl();
  if (!base) throw new Error("Set APP_URL so invite links point at the app.");
  const now = new Date();

  const where = familyWhere(opts.filter ?? { group: null, need: null, search: null }, AGE_GROUPS, 1);
  const invites = await asSystem(async (tx) => {
    // The email names every child of the parent's, not just those in the filtered list.
    const targets = await tx.query<{ id: string; first_name: string; email: string; children: string[] }>(
      opts.guardianIds
        ? `select g.id, g.first_name, g.email, array_agg(p.first_name order by p.date_of_birth nulls last, p.first_name) as children
           from guardians g
           join player_guardians pg on pg.guardian_id = g.id
           join players p on p.id = pg.player_id
           where g.email is not null and g.id = any($1::uuid[])
           group by g.id`
        : `select g.id, g.first_name, g.email, array_agg(p.first_name order by p.date_of_birth nulls last, p.first_name) as children
           from guardians g
           join player_guardians pg on pg.guardian_id = g.id
           join players p on p.id = pg.player_id
           where ${UNINVITED}
             and exists (select 1 from player_guardians fpg join players p on p.id = fpg.player_id where fpg.guardian_id = g.id and ${where.sql})
           group by g.id`,
      opts.guardianIds ? [opts.guardianIds] : where.params,
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

/**
 * A parent added the other parent (Player → Your family): emails that parent a week-long sign-in link naming who added
 * them and the children they were added to, and tells the club's admins. Marks them invited only if the email went;
 * a link that never went is dropped. Run after the response (`after` + `enqueue`); never throws for an email.
 */
export async function sendCoParentInvite(opts: { guardianId: string; addedBy: string; children: string[]; baseUrl: string | null }): Promise<boolean> {
  const base = opts.baseUrl ?? appUrl();
  if (!base) return false;
  const now = new Date();
  const invite = await asSystem(async (tx) => {
    const [g] = await tx.query<{ first_name: string; last_name: string; email: string | null }>(`select first_name, last_name, email from guardians where id = $1`, [
      opts.guardianId,
    ]);
    if (!g?.email) return null;
    const issued = await issueSignIn(tx, { email: g.email.toLowerCase(), ip: null, now, purpose: "invite" });
    if (!issued.ok) return null;
    const admins = await tx.query<{ email: string }>(`select email from staff where role = 'admin'`);
    return {
      requestId: issued.request.requestId,
      email: coParentInviteEmail({
        to: g.email,
        firstName: g.first_name,
        addedBy: opts.addedBy,
        children: opts.children,
        link: `${base}/sign-in/link?token=${issued.request.token}`,
        appUrl: base,
      }),
      admins: admins.map((a) => a.email),
      parentName: `${g.first_name} ${g.last_name}`.trim(),
      address: g.email,
    };
  });
  if (!invite) return false;
  const report = await sendEmails([invite.email]);
  const went = report.sent.includes(invite.email);
  await asSystem((tx) =>
    went
      ? tx.query(`update guardians set invited_at = coalesce(invited_at, $2) where id = $1`, [opts.guardianId, now])
      : tx.query(`delete from auth.sign_in_requests where id = $1`, [invite.requestId]),
  );
  if (!went) console.error("[add parent] invite email not sent.");
  if (invite.admins.length) {
    const club = await sendEmails(
      invite.admins.map((to) =>
        coParentAddedEmail({ to, addedBy: opts.addedBy, parentName: invite.parentName, email: invite.address, children: opts.children, invited: went, link: `${base}/admin/families`, appUrl: base }),
      ),
    );
    if (club.failed.length) console.error(`[add parent] club email not sent to ${club.failed.length} admin(s).`);
  }
  return went;
}
