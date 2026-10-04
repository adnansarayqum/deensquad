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

export type BankDetails = { accountName: string; sortCode: string; accountNumber: string };

/** The club account parents pay shop orders into by bank transfer. The demo shows sample details. */
export function bankDetails(): BankDetails | null {
  const accountName = process.env.BANK_ACCOUNT_NAME?.trim();
  const sortCode = process.env.BANK_SORT_CODE?.trim();
  const accountNumber = process.env.BANK_ACCOUNT_NUMBER?.trim();
  if (accountName && sortCode && accountNumber) return { accountName, sortCode, accountNumber };
  if (process.env.DEMO_MODE === "1") return { accountName: "Deen Squad FA (sample)", sortCode: "00-00-00", accountNumber: "00000000" };
  return null;
}

/** Who hears about new shop orders. Defaults to every admin on the Staff screen. */
export function shopOrdersEmails(): string[] {
  return (process.env.SHOP_ORDERS_EMAIL ?? "").split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
}
