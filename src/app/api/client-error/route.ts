import { getCurrentUser } from "@/lib/auth/session";
import { sendErrorAlert } from "@/lib/alerts";
import { windowCounter } from "@/lib/calendar/feed";
import { isNoise, readReport } from "@/lib/observability/client-errors";

// Errors from people's phones (ClientErrorReporter): logged and emailed like the server's own (sendErrorAlert: at most
// one email every 30 minutes, path and message only). Signed-in people only, 20 reports an hour each, so nobody can
// use it to send the club emails.
const perPerson = windowCounter(20);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 204 });
  const report = readReport(await request.json().catch(() => null));
  if (!report || isNoise(report.message) || !perPerson.hit(user.id)) return new Response(null, { status: 204 });
  const who = user.staff ? user.staff.role : "parent";
  console.error(`[client-error] ${who} on ${report.path}: ${report.message}`);
  await sendErrorAlert({ message: report.message, path: report.path, kind: `browser (${who}'s phone)` });
  return new Response(null, { status: 204 });
}
