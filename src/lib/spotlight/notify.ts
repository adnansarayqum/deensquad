import "server-only";
import { reportJobFailure } from "../alerts";
import { inQuietHours } from "../chase/ladder";
import { pushConfigured, pushToUsers, type PushPayload } from "../chase/senders";
import { appUrl } from "../config";
import { asSystem } from "../db";
import type { Queryable } from "../db/types";
import { groupPlural, type AgeGroup } from "../domain";
import { canSendEmail, sendEmails, type Email } from "../email/send";
import { spotlightEmail } from "../email/templates";

// Telling a child's parents they're Player of the week: an app notification where they have one, else an email.
// Once per spotlight (parents_told_at), never in quiet hours (the hourly job sends it in the morning instead), and
// not for one over 7 days old.

type Senders = {
  push: ((tx: Queryable, userIds: string[], payload: PushPayload) => Promise<Set<string>>) | null;
  email: ((emails: Email[]) => Promise<{ sent: Email[]; failed: Email[] }>) | null;
  appUrl: string | null;
};

export async function sendSpotlightNotices(tx: Queryable, now: Date, senders: Senders): Promise<number> {
  if (inQuietHours(now) || (!senders.push && !senders.email)) return 0;
  await tx.query("select pg_advisory_xact_lock(727283)");
  const rows = await tx.query<{ id: string; player_id: string; first_name: string; age_group: AgeGroup; guardian_id: string | null; user_id: string | null; email: string | null }>(
    `select sp.id, sp.player_id, p.first_name, sp.age_group::text as age_group, g.id as guardian_id, g.auth_user_id as user_id, g.email
     from player_spotlights sp
     join players p on p.id = sp.player_id and p.approved_at is not null
     left join player_guardians pg on pg.player_id = p.id
     left join guardians g on g.id = pg.guardian_id
     where sp.parents_told_at is null and sp.created_at > $1::timestamptz - interval '7 days'`,
    [now],
  );
  let reachedParents = 0;
  for (const id of new Set(rows.map((r) => r.id))) {
    const mine = rows.filter((r) => r.id === id);
    const { first_name: firstName, age_group: group, player_id: playerId } = mine[0];
    const title = `Masha'Allah, ${firstName} is the ${groupPlural(group)}' Player of the week`;
    const users = mine.flatMap((r) => (r.user_id ? [r.user_id] : []));
    const pushed = senders.push && users.length ? await senders.push(tx, users, { title, body: "Open the app to see the card and share it.", url: `/player?child=${playerId}` }) : new Set<string>();
    const byEmail = mine.filter((r) => r.email && !(r.user_id && pushed.has(r.user_id)));
    const emailed =
      senders.email && byEmail.length
        ? await senders.email(
            byEmail.map((r) => ({
              ...spotlightEmail({ to: r.email!, firstName, group: groupPlural(group), link: senders.appUrl ? `${senders.appUrl}/player?child=${playerId}` : null, appUrl: senders.appUrl }),
              idempotencyKey: `spotlight:${id}:${r.guardian_id}`,
            })),
          )
        : { sent: [], failed: [] };
    const reached = pushed.size + emailed.sent.length;
    reachedParents += reached;
    // Marked once anyone was reached, or when there is nobody to tell (no parent linked).
    if (reached > 0 || mine.every((r) => !r.guardian_id)) await tx.query(`update player_spotlights set parents_told_at = $2 where id = $1`, [id, now]);
  }
  return reachedParents;
}

/** After a pick, and hourly as the retry. Never throws. */
export async function runSpotlightNotices(now = new Date()): Promise<number | { error: string }> {
  try {
    return await asSystem((tx) =>
      sendSpotlightNotices(tx, now, {
        push: pushConfigured() ? (t, users, payload) => pushToUsers(t, users, payload) : null,
        email: canSendEmail() ? sendEmails : null,
        appUrl: appUrl(),
      }),
    );
  } catch (error) {
    reportJobFailure("spotlight notices", error);
    return { error: "failed" };
  }
}
