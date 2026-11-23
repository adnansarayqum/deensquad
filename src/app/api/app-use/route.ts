import { getCurrentUser } from "@/lib/auth/session";
import { asSystem } from "@/lib/db";
import { windowCounter } from "@/lib/calendar/feed";
import { recordOpen, recordTimeOnScreen } from "@/lib/app-use/record";

// A parent opened the app or came back to it ("open"), or put it away ("leave", with the seconds it was on screen).
// Sent by AppUseBeacon on parent screens. Staff (including staff who are also parents) aren't counted, so the club's
// own checking doesn't swell the figures. Opens are kept per parent and day; time only as the club's day total.
const limit = windowCounter(240);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.guardian) return new Response(null, { status: 401 });
  if (user.staff || !limit.hit(user.id)) return new Response(null, { status: 204 });
  const body = (await request.json().catch(() => null)) as { event?: unknown; seconds?: unknown } | null;
  const guardianId = user.guardian.id;
  if (body?.event === "open") await asSystem((tx) => recordOpen(tx, guardianId));
  else if (body?.event === "leave" && typeof body.seconds === "number" && Number.isFinite(body.seconds)) {
    const seconds = body.seconds;
    await asSystem((tx) => recordTimeOnScreen(tx, seconds));
  } else return new Response(null, { status: 400 });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
