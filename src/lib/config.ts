import { normaliseEmail } from "./auth/tokens";

/** The app's public address for links in emails. Never taken from the request's Host header in production. */
export function appUrl(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway}`;
  return null;
}

/** People who are made admins when they first sign in (comma-separated ADMIN_EMAILS). */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map(normaliseEmail)
      .filter((e): e is string => e !== null),
  );
}

/** The club's TeamFeePay sign-up link, shown on the payments step. */
export function teamFeePayUrl(): string | null {
  return process.env.TEAMFEEPAY_URL?.trim() || null;
}

/** The club's privacy notice, linked from the sign-in screen once the club has one. */
export function privacyUrl(): string | null {
  return process.env.PRIVACY_URL?.trim() || null;
}
