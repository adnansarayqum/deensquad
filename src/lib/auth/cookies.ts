// Cookie names and options, shared by the proxy (which keeps the session cookie alive) and the actions.

export const SESSION_COOKIE = "ds_session";
/** Which sign-in request the code screen is for, and the masked address it went to. Lives 15 minutes. */
export const PENDING_COOKIE = "ds_pending";

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Only same-site paths, so `?next=` can't send someone to another website. */
export function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}
