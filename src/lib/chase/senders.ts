import "server-only";

import webpush from "web-push";
import { issueSignIn } from "../auth/service";
import { appUrl } from "../config";
import type { Queryable } from "../db/types";
import { canSendEmail, sendEmails } from "../email/send";
import { reminderEmail } from "../email/templates";
import { dialable } from "../validate";
import type { ChaseTarget, Senders } from "./ladder";

// How each step of the ladder reaches a parent. A step whose service isn't set up is left out,
// so it stays due and goes out once it is.

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function smsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

export type PushPayload = { title: string; body: string; url: string };

/** Sends to every device of each user; forgets devices the push service says are gone. Returns users reached. */
export async function pushToUsers(tx: Queryable, userIds: string[], payload: PushPayload): Promise<Set<string>> {
  const reached = new Set<string>();
  if (!pushConfigured() || userIds.length === 0) return reached;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const subs = await tx.query<Subscription>(`select id, user_id, endpoint, p256dh, auth from push_subscriptions where user_id = any($1::uuid[])`, [userIds]);
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 12 * 3600 });
      reached.add(s.user_id);
      await tx.query(`update push_subscriptions set last_success_at = now() where id = $1`, [s.id]);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await tx.query(`delete from push_subscriptions where id = $1`, [s.id]);
      else console.error("[push] failed:", status ?? (error instanceof Error ? error.message : error));
    }
  }
  return reached;
}

async function sendApp(targets: ChaseTarget[], tx: Queryable): Promise<ChaseTarget[]> {
  const byMessage = new Map<string, ChaseTarget[]>();
  for (const t of targets) byMessage.set(t.announcementId, [...(byMessage.get(t.announcementId) ?? []), t]);
  const sent: ChaseTarget[] = [];
  for (const group of byMessage.values()) {
    const reached = await pushToUsers(
      tx,
      group.flatMap((t) => (t.userId ? [t.userId] : [])),
      { title: "Deen Squad: please read", body: group[0].title, url: "/news" },
    );
    sent.push(...group.filter((t) => t.userId && reached.has(t.userId)));
  }
  return sent;
}

async function sendEmail(targets: ChaseTarget[], tx: Queryable): Promise<ChaseTarget[]> {
  const base = appUrl();
  if (!base) return [];
  const now = new Date();
  const emails = [];
  for (const t of targets) {
    let link = `${base}/news`;
    // Parents who haven't signed in yet get a week-long sign-in link, like an invite.
    if (!t.userId) {
      const issued = await issueSignIn(tx, { email: t.email!.toLowerCase(), ip: null, now, purpose: "invite" });
      if (issued.ok) link = `${base}/sign-in/link?token=${issued.request.token}`;
    }
    emails.push(reminderEmail({ to: t.email!, firstName: t.firstName, title: t.title, body: t.body, children: t.children, link, appUrl: base }));
  }
  await sendEmails(emails);
  return targets;
}

/** Twilio's Messages API. TWILIO_FROM is the sending number in +44 format, or an alphanumeric sender ID. */
async function sendSms(targets: ChaseTarget[]): Promise<ChaseTarget[]> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const base = appUrl() ?? "";
  const sent: ChaseTarget[] = [];
  for (const t of targets) {
    const body = `Deen Squad: please open the app and read "${t.title}". ${base}/news`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: `+${dialable(t.phone!)}`, From: process.env.TWILIO_FROM!, Body: body }),
    });
    if (res.ok) sent.push(t);
    else console.error("[sms] Twilio refused a message:", res.status, (await res.text().catch(() => "")).slice(0, 200));
  }
  return sent;
}

export function liveSenders(): Senders {
  return {
    pushUsers: async (tx) => new Set((await tx.query<{ user_id: string }>(`select distinct user_id from push_subscriptions`)).map((r) => r.user_id)),
    ...(pushConfigured() ? { app: sendApp } : {}),
    ...(canSendEmail() && appUrl() ? { email: sendEmail } : {}),
    ...(smsConfigured() ? { sms: sendSms } : {}),
  };
}
