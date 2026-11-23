import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { readFromNotification } from "@/lib/app-use/record";

// "Mark as read" on a notification (public/sw.js): the same read as the button in the app, sent from the lock screen.
// Answers 200 { read: true } when it's done; anything else and the service worker opens the app instead.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.guardian) return Response.json({ read: false }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null;
  if (!id) return Response.json({ read: false }, { status: 400 });
  const read = await asUser(user.id, (tx) => readFromNotification(tx, id));
  return Response.json({ read }, { status: read ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
