import { headers } from "next/headers";
import { clientIpFrom } from "@/lib/auth/ip";
import { allowFeed, allowLookupFrom, guardianForToken, hashCalendarToken, loadFeedSessions, recordMiss, tokenFromFile } from "@/lib/calendar/feed";
import { buildCalendar } from "@/lib/calendar/ics";
import { asSystem } from "@/lib/db";

// A family's calendar feed (Player → Calendar), fetched by calendar apps without a cookie: the token in the address
// is the only key (public in src/proxy.ts). Unknown or reset tokens get a plain 404. Errors are logged here without
// the address, so the token never reaches an error alert.
export async function GET(_request: Request, { params }: RouteContext<"/api/calendar/[file]">) {
  const ip = clientIpFrom(await headers());
  const token = tokenFromFile((await params).file);
  if (!token) return notFound();
  // An address that has asked for 30 unknown links this hour gets no more lookups. Only real links are counted
  // against their own 60 an hour, so made-up ones never crowd them out of the store.
  if (!allowLookupFrom(ip)) return tooMany();
  try {
    const now = new Date();
    const result = await asSystem(async (tx) => {
      const guardian = await guardianForToken(tx, token);
      if (!guardian) return "unknown" as const;
      if (!allowFeed(hashCalendarToken(token))) return "limited" as const;
      return buildCalendar(await loadFeedSessions(tx, guardian, now), now);
    });
    if (result === "unknown") {
      recordMiss(ip);
      return notFound();
    }
    if (result === "limited") return tooMany();
    const body = result;
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

function tooMany() {
  return new Response("Too many requests. Try again later.", { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
