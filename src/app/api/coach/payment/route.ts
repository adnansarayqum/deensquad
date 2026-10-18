import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { takeGatePayment, undoGatePayment } from "@/lib/gate/payments";

// "Paid £7" on the scanner's result card: a route, like the scan itself, so a slow signal never holds up the next
// scan (Next runs a page's Server Actions one at a time). JSON in, JSON out; the register refreshes when the scanner
// closes. Same rules as the register's button: staff only, only on the session's own day.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.staff) return Response.json({ error: "signed_out" }, { status: 401 });
  const staffId = user.staff.id;
  const body = (await request.json().catch(() => null)) as { session?: unknown; child?: unknown; undo?: unknown } | null;
  const session = body?.session;
  const child = body?.child;
  if (typeof session !== "string" || typeof child !== "string" || !UUID.test(session) || !UUID.test(child)) {
    return Response.json({ error: "That didn't save. Reload the page and try again." }, { status: 400 });
  }
  const now = new Date();
  const result = await asUser(user.id, (tx) =>
    body?.undo === true ? undoGatePayment(tx, session, { playerId: child }, now) : takeGatePayment(tx, session, { playerId: child }, staffId, now),
  );
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
