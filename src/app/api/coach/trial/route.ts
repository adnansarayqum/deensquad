import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { setTrialArrived } from "@/lib/trials/data";

// A trial's "Arrived" on the register: a route, like Mark here, so one tap stuck on a weak signal never holds up the
// rest of the register (Next runs a page's Server Actions one at a time). Staff only, only on the session's own day.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.staff) return Response.json({ error: "signed_out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { session?: unknown; trial?: unknown; arrived?: unknown } | null;
  const session = body?.session;
  const trial = body?.trial;
  if (typeof session !== "string" || typeof trial !== "string" || !UUID.test(session) || !UUID.test(trial)) {
    return Response.json({ error: "That didn't save. Reload the page and try again." }, { status: 400 });
  }
  const result = await asUser(user.id, (tx) => setTrialArrived(tx, session, trial, body?.arrived !== false, new Date()));
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
