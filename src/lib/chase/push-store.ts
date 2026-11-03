import { asSystem } from "../db";
import { isPushEndpoint } from "./push-endpoint";

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Saves a device for this person. Only an endpoint on a known push service is accepted. */
export async function storePushSubscription(userId: string, sub: PushSubscriptionInput | null | undefined, userAgent: string | null): Promise<{ ok: boolean }> {
  const valid =
    !!sub &&
    isPushEndpoint(sub.endpoint) &&
    typeof sub.keys?.p256dh === "string" &&
    typeof sub.keys?.auth === "string" &&
    sub.keys.p256dh.length < 200 &&
    sub.keys.auth.length < 100;
  if (!valid) return { ok: false };
  // An endpoint belongs to one browser. If someone else was signed in on it before, it now belongs to this person.
  await asSystem((tx) =>
    tx.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
      [userId, sub!.endpoint, sub!.keys.p256dh, sub!.keys.auth, userAgent?.slice(0, 200) ?? null],
    ),
  );
  return { ok: true };
}
