import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { windowCounter } from "@/lib/calendar/feed";
import { asSystem } from "@/lib/db";
import { addSponsorClick } from "@/lib/sponsors/views";

// Sent by SponsorLink when a parent taps a sponsor's website or social link. Adds one to that sponsor's total for the
// day: a count only, never who. Staff aren't counted (as with the times shown), so the club's own checking doesn't
// swell a figure it passes on.
const limit = windowCounter(30);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null;
  if (!id) return new Response(null, { status: 400 });
  if (user.guardian && !user.staff && limit.hit(user.id)) await asSystem((tx) => addSponsorClick(tx, id));
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
