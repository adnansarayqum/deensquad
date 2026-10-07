"use server";

import { headers } from "next/headers";
import { requireUser } from "../auth/session";
import { asSystem } from "../db";
import { isPushEndpoint } from "./push-endpoint";

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Saves this device so the club's messages can reach it. Only an endpoint on a known push service is accepted. */
export async function savePushSubscription(sub: PushSubscriptionInput): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const valid =
    isPushEndpoint(sub?.endpoint) &&
    typeof sub.keys?.p256dh === "string" &&
    typeof sub.keys?.auth === "string" &&
    sub.keys.p256dh.length < 200 &&
    sub.keys.auth.length < 100;
  if (!valid) return { ok: false };
  const agent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  // An endpoint belongs to one browser. If someone else was signed in on it before, it now belongs to this person.
  await asSystem((tx) =>
    tx.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
      [user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, agent],
    ),
  );
  return { ok: true };
}
