import { after } from "next/server";
import { sendScannerWarning } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { enqueue } from "@/lib/background";
import { asSystem, asUser } from "@/lib/db";
import { markHere, undoHere } from "@/lib/staff/checkin";
import { quietScanner } from "@/lib/staff/scanner-watch";

// Mark here and Undo on the register. A route, like the scan, not a Server Action: Next runs a page's actions one at a
// time with no time limit, so one tap stuck on a weak signal froze every later tap and the register's refresh (found
// in the review after Fri 30 Oct 2026). The buttons give up after 10 s and offer Try again.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.staff) return Response.json({ error: "You've been signed out. Sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { session?: unknown; child?: unknown; undo?: unknown } | null;
  const session = body?.session;
  const child = body?.child;
  if (typeof session !== "string" || typeof child !== "string" || !UUID.test(session) || !UUID.test(child)) {
    return Response.json({ error: "That didn't save. Reload the page and try again." }, { status: 400 });
  }
  const now = new Date();
  const undo = body?.undo === true;
  const result = await asUser(user.id, (tx) => (undo ? undoHere(tx, session, child, now) : markHere(tx, session, child, now)));
  // Lots of hand marking and no scans: the scanner may be broken, so the maintainer is told (scanner-watch.ts).
  if (!undo && !result.error) {
    after(() =>
      enqueue("scanner watch", async () => {
        const quiet = await asSystem((tx) => quietScanner(tx, session));
        if (quiet) await sendScannerWarning(session, quiet.title, quiet.manual);
      }),
    );
  }
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
