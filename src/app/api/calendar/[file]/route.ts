import { allowFeed, guardianForToken, hashCalendarToken, loadFeedSessions, tokenFromFile } from "@/lib/calendar/feed";
import { buildCalendar } from "@/lib/calendar/ics";
import { asSystem } from "@/lib/db";

// A family's calendar feed (Player → Calendar), fetched by calendar apps without a cookie: the token in the address
// is the only key (public in src/proxy.ts). Unknown or reset tokens get a plain 404. Errors are logged here without
// the address, so the token never reaches an error alert.
export async function GET(_request: Request, { params }: RouteContext<"/api/calendar/[file]">) {
  const token = tokenFromFile((await params).file);
  if (!token) return notFound();
  if (!allowFeed(hashCalendarToken(token))) {
    return new Response("Too many requests. Try again later.", { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
  }
  try {
    const now = new Date();
    const body = await asSystem(async (tx) => {
      const guardian = await guardianForToken(tx, token);
      return guardian ? buildCalendar(await loadFeedSessions(tx, guardian, now), now) : null;
    });
    if (body === null) return notFound();
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="deen-squad.ics"',
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[calendar] feed failed:", error instanceof Error ? error.message : error);
    return new Response("Something went wrong. Try again later.", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
