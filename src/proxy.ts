import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cookieOptions } from "@/lib/auth/cookies";

// Optimistic check only: no session cookie means "go and sign in". Every page and action still
// checks the session against the database (src/lib/auth/session.ts) before touching data.

const PUBLIC = [/^\/sign-in(\/|$)/, /^\/api\/health$/, /^\/api\/cron\//, /^\/api\/sumup\//];
const SESSION_SECONDS = 90 * 86400;

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token && !PUBLIC.some((p) => p.test(pathname))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  // Keep the cookie alive while the app is in use (the database expiry slides the same way).
  if (token) response.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_SECONDS));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|crest.png|icons/|sw.js).*)"],
};
