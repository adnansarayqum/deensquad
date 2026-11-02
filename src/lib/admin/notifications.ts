import { AGE_GROUPS, type AgeGroup } from "../domain";
import type { Queryable } from "../db/types";
import { sendEmails } from "../email/send";
import { notificationHelpEmail } from "../email/templates";

/** Days before a parent can be sent the "how to turn on notifications" email again. */
export const HELP_GAP_DAYS = 7;

export type NotificationParent = {
  id: string;
  name: string;
  firstName: string;
  email: string | null;
  phone: string | null;
  helpSentAt: string | null;
  children: { id: string; name: string; group: AgeGroup }[];
};
export type NotificationLists = { on: NotificationParent[]; off: NotificationParent[]; notIn: NotificationParent[] };

/**
 * Every parent with a child in `groups` (a group coach's own; admins every group), sorted into: notifications on
 * (a phone or browser they signed in on allowed them), off (on the app, but none), and not on the app yet. Read as
 * the member of staff: `guardian_notifications_on` answers yes or no only, never the device.
 */
export async function loadNotificationParents(tx: Queryable, groups: readonly AgeGroup[] | null): Promise<NotificationLists> {
  const rows = await tx.query<{
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    in_app: boolean;
    on: boolean;
    help_sent_at: Date | null;
    children: { id: string; first_name: string; last_name: string; age_group: AgeGroup }[];
  }>(
    `select g.id, g.first_name, g.last_name, g.email, g.phone, g.auth_user_id is not null as in_app,
       guardian_notifications_on(g.id) as on, g.notification_help_sent_at as help_sent_at,
       json_agg(json_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'age_group', p.age_group::text)
                order by p.first_name) as children
     from guardians g
     join player_guardians pg on pg.guardian_id = g.id
     join players p on p.id = pg.player_id
     where p.age_group::text = any ($1::text[])
     group by g.id
     order by g.first_name, g.last_name`,
    [[...(groups ?? AGE_GROUPS)]],
  );
  const lists: NotificationLists = { on: [], off: [], notIn: [] };
  for (const r of rows) {
    const parent: NotificationParent = {
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
      firstName: r.first_name,
      email: r.email,
      phone: r.phone,
      helpSentAt: r.help_sent_at ? new Date(r.help_sent_at).toISOString() : null,
      children: r.children.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, group: c.age_group })),
    };
    (r.in_app ? (r.on ? lists.on : lists.off) : lists.notIn).push(parent);
  }
  return lists;
}

/** Whether a parent was sent the help email within the last HELP_GAP_DAYS. */
export const helpedRecently = (p: Pick<NotificationParent, "helpSentAt">, now: Date) =>
  p.helpSentAt !== null && now.getTime() - new Date(p.helpSentAt).getTime() < HELP_GAP_DAYS * 86_400_000;

/**
 * Emails each of these parents the steps to turn notifications on, as the system. Checks again that each is on the
 * app with notifications off, has an email address and wasn't emailed in the last HELP_GAP_DAYS; marks only those
 * the email reached. One idempotency key per parent per day, so a retried send can't email anyone twice.
 */
export async function sendNotificationHelp(
  tx: Queryable,
  opts: { guardianIds: string[]; baseUrl: string; now?: Date },
): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = opts.now ?? new Date();
  if (opts.guardianIds.length === 0) return { sent: 0, failed: 0, skipped: 0 };
  const targets = await tx.query<{ id: string; first_name: string; email: string }>(
    `select g.id, g.first_name, g.email from guardians g
     where g.id = any($1::uuid[]) and g.email is not null and g.auth_user_id is not null
       and not exists (select 1 from push_subscriptions s where s.user_id = g.auth_user_id)
       and (g.notification_help_sent_at is null or g.notification_help_sent_at < $2::timestamptz - make_interval(days => $3))`,
    [opts.guardianIds, now, HELP_GAP_DAYS],
  );
  const day = now.toISOString().slice(0, 10);
  const emails = targets.map((t) => ({
    ...notificationHelpEmail({ to: t.email, firstName: t.first_name, link: `${opts.baseUrl}/news`, appUrl: opts.baseUrl }),
    idempotencyKey: `notification-help:${t.id}:${day}`,
  }));
  const result = emails.length ? await sendEmails(emails) : { sent: [], failed: [] };
  const sentTo = new Set(result.sent.map((e) => e.to.toLowerCase()));
  const reached = targets.filter((t) => sentTo.has(t.email.toLowerCase())).map((t) => t.id);
  if (reached.length) await tx.query(`update guardians set notification_help_sent_at = $2 where id = any($1::uuid[])`, [reached, now]);
  return { sent: reached.length, failed: targets.length - reached.length, skipped: opts.guardianIds.length - targets.length };
}
