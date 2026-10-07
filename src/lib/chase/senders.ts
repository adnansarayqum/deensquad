import "server-only";

import webpush from "web-push";
import { issueSignIn } from "../auth/service";
import { appUrl } from "../config";
import type { Queryable } from "../db/types";
import { SEND_TIMEOUT_MS, canSendEmail, sendEmails, type Email } from "../email/send";
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

/** One push to one device; rejects with the push service's `statusCode` when it refuses. */
export type PushSend = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string) => Promise<unknown>;

const sendWebPush: PushSend = (sub, body) => webpush.sendNotification(sub, body, { TTL: 12 * 3600, timeout: SEND_TIMEOUT_MS });

/** How many devices (or phones, for SMS) are sent to at once. */
export const PUSH_WORKERS = 10;

/**
 * Runs `fn` over `items` from up to `limit` workers, each taking the next item as soon as its last one settles, so
 * one slow service holds up one worker rather than a whole batch. Results keep the items' order.
 */
export async function inWorkers<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await Promise.resolve()
        .then(() => fn(items[i]))
        .then(
          (value) => ({ status: "fulfilled", value }) as const,
          (reason: unknown) => ({ status: "rejected", reason }) as const,
        );
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Sends to every device of each user; forgets devices the push service says are gone. Returns users reached.
 * Up to PUSH_WORKERS sends are in flight at once, each worker taking the next device as soon as its last send
 * settles, so one slow push service holds up one worker rather than a whole batch. The database writes follow,
 * one at a time, as one transaction can't run statements in parallel (postgres.js).
 */
export async function pushToUsers(tx: Queryable, userIds: string[], payload: PushPayload, send: PushSend = sendWebPush): Promise<Set<string>> {
  const reached = new Set<string>();
  if (!pushConfigured() || userIds.length === 0) return reached;
  if (send === sendWebPush) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  }
  const subs = await tx.query<Subscription>(`select id, user_id, endpoint, p256dh, auth from push_subscriptions where user_id = any($1::uuid[])`, [userIds]);
  const body = JSON.stringify(payload);
  // Only the network calls are caught: a failed statement must abort the transaction, not be swallowed.
  const results = await inWorkers(subs, PUSH_WORKERS, (s) => send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body));
  const ok: string[] = [];
  const gone: string[] = [];
  results.forEach((result, i) => {
    const s = subs[i];
    if (result.status === "fulfilled") {
      reached.add(s.user_id);
      ok.push(s.id);
      return;
    }
    const error = result.reason;
    const status = (error as { statusCode?: number } | undefined)?.statusCode;
    if (status === 404 || status === 410) gone.push(s.id);
    else console.error("[push] failed:", status ?? (error instanceof Error ? error.message : error));
  });
  for (const id of ok) await tx.query(`update push_subscriptions set last_success_at = now() where id = $1`, [id]);
  for (const id of gone) await tx.query(`delete from push_subscriptions where id = $1`, [id]);
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
  const out: { target: ChaseTarget; email: Email; requestId: string | null }[] = [];
  for (const t of targets) {
    let link = `${base}/news`;
    let requestId: string | null = null;
    // Parents who haven't signed in yet get a week-long sign-in link, like an invite.
    if (!t.userId) {
      const issued = await issueSignIn(tx, { email: t.email!.toLowerCase(), ip: null, now, purpose: "invite" });
      if (issued.ok) {
        link = `${base}/sign-in/link?token=${issued.request.token}`;
        requestId = issued.request.requestId;
      }
    }
    const email = reminderEmail({ to: t.email!, firstName: t.firstName, title: t.title, body: t.body, children: t.children, link, appUrl: base });
    // One reminder email per message per parent: a later run retrying one that timed out but went isn't sent twice.
    out.push({ target: t, requestId, email: { ...email, idempotencyKey: `${t.announcementId}:${t.guardianId}:email` } });
  }
  const report = await sendEmails(out.map((o) => o.email));
  const went = new Set(report.sent);
  // Links in emails that didn't go are dropped; the reminder stays due and gets a fresh one next time.
  const unsent = out.filter((o) => !went.has(o.email) && o.requestId).map((o) => o.requestId);
  if (unsent.length) await tx.query(`delete from auth.sign_in_requests where id = any($1::uuid[])`, [unsent]);
  return out.filter((o) => went.has(o.email)).map((o) => o.target);
}

/** One text to one phone; true if Twilio took it. */
export type SmsSend = (to: string, body: string) => Promise<boolean>;

/** Twilio's Messages API. TWILIO_FROM is the sending number in +44 format, or an alphanumeric sender ID. */
const sendTwilio: SmsSend = async (to, body) => {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) console.error("[sms] Twilio refused a message:", res.status, (await res.text().catch(() => "")).slice(0, 200));
  return res.ok;
};

/** Texts each parent, PUSH_WORKERS at a time (as push does), so one slow send holds up one worker, not the run. */
export async function sendSmsTo(targets: ChaseTarget[], send: SmsSend = sendTwilio): Promise<ChaseTarget[]> {
  const base = appUrl() ?? "";
  const results = await inWorkers(targets, PUSH_WORKERS, (t) => send(`+${dialable(t.phone!)}`, `Deen Squad: please open the app and read "${t.title}". ${base}/news`));
  return targets.filter((t, i) => {
    const r = results[i];
    if (r.status === "fulfilled") return r.value;
    // Timed out or couldn't connect: not sent, so it stays due.
    console.error("[sms] failed:", r.reason instanceof Error ? r.reason.message : r.reason);
    return false;
  });
}

const sendSms = (targets: ChaseTarget[]) => sendSmsTo(targets);

export function liveSenders(): Senders {
  return {
    pushUsers: async (tx) => new Set((await tx.query<{ user_id: string }>(`select distinct user_id from push_subscriptions`)).map((r) => r.user_id)),
    ...(pushConfigured() ? { app: sendApp } : {}),
    ...(canSendEmail() && appUrl() ? { email: sendEmail } : {}),
    ...(smsConfigured() ? { sms: sendSms } : {}),
  };
}
