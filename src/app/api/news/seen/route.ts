import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { markSeen, SEEN_MAX } from "@/lib/app-use/record";

// Posts whose headline appeared on a parent's Home screen (SeenTracker). Written as the parent, so row level
// security allows only posts they can read, under their own name.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.guardian) return new Response(null, { status: 401 });
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string" && UUID.test(id)).slice(0, SEEN_MAX) : [];
  if (!ids.length) return new Response(null, { status: 400 });
  await asUser(user.id, (tx) => markSeen(tx, ids));
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
