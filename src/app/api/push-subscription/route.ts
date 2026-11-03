import { getCurrentUser } from "@/lib/auth/session";
import { storePushSubscription, type PushSubscriptionInput } from "@/lib/chase/push-store";

// Saves this device's push subscription. A route, not a Server Action: Home saves it on every visit, and Next runs a
// page's actions one at a time, so a save stuck on a weak signal held up every tap after it (Coming, I've read this).
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });
  const sub = (await request.json().catch(() => null)) as PushSubscriptionInput | null;
  const result = await storePushSubscription(user.id, sub, request.headers.get("user-agent"));
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
