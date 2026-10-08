import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { buildCalendar } from "@/lib/calendar/ics";
import { loadCalendarSession, sessionIcsFilename } from "@/lib/calendar/session";
import { asUser } from "@/lib/db";

// "Add to calendar" → "Apple or other calendar (.ics)" under a Coming answer on Friday: one session as a calendar
// file. Signed in only; a parent gets a session that's for one of their own children, staff any session. Anything
// else is a plain 404, so the address says nothing about sessions that aren't yours.
export async function GET(_request: Request, { params }: RouteContext<"/api/sessions/[id]/ics">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to add this session to your calendar.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  const session = await asUser(user.id, (tx) => loadCalendarSession(tx, id, Boolean(user.staff)));
  if (!session) return notFound();
  const now = new Date();
  return new Response(buildCalendar([session], now), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${sessionIcsFilename(session.startsAt)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
