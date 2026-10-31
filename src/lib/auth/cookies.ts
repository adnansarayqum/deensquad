// Cookie names and options, shared by the proxy (which keeps the session cookie alive) and the actions.

export const SESSION_COOKIE = "ds_session";
/** Which sign-in request the code screen is for, and the masked address it went to. Lives 15 minutes. */
export const PENDING_COOKIE = "ds_pending";

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Secure in production. The one exception is a production build served at http://localhost (the end-to-end
    // tests): Safari's engine won't keep a Secure cookie over plain http, so the iPhone tests couldn't sign in.
    secure: process.env.NODE_ENV === "production" && !(process.env.APP_URL ?? "").startsWith("http://localhost"),
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Only same-site paths, so `?next=` can't send someone to another website. Control characters, spaces and
 * backslashes are refused too: browsers drop a tab or newline from a URL, so "/\t/evil.example" becomes "//evil.example".
 */
export function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !/[\x00-\x20\x7f\\]/.test(value) ? value : "/";
}
