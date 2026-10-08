import { getCurrentUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { checkInByPass } from "@/lib/staff/checkin";

// The gate scanner's check-in. A route, not a Server Action: Next runs a page's actions and refreshes one at a time,
// so one scan stuck on a weak signal would hold up every later scan, Mark here and Undo until the page reloads.
// The scanner calls this with its own timeout and refreshes the register itself when it closes.
// Cross-site posts can't carry the sign-in cookie (SameSite=Lax), and the body is JSON, not a form.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.staff) return Response.json({ error: "signed_out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const result = await asUser(user.id, (tx) => checkInByPass(tx, body?.token, new Date()));
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
