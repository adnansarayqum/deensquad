import { createHmac, timingSafeEqual } from "node:crypto";
import { UUID } from "../auth/tokens";

// The family gate pass: "DS1.<guardian id>.<signature>". The signature is an HMAC with QR_SECRET,
// so a pass can't be made up or altered, and it works without signal at the gate (it's just a picture).
// Changing QR_SECRET cancels every pass at once.

const PREFIX = "DS1";

function secret(): string {
  const s = process.env.QR_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "1") return "development-only-qr-secret";
  throw new Error("QR_SECRET is not set.");
}

function sign(guardianId: string): string {
  return createHmac("sha256", secret()).update(`${PREFIX}.${guardianId}`).digest("base64url").slice(0, 22);
}

export function passToken(guardianId: string): string {
  return `${PREFIX}.${guardianId}.${sign(guardianId)}`;
}

/** The guardian id inside a genuine pass, or null. */
export function readPass(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const [prefix, guardianId, sig] = token.trim().split(".");
  if (prefix !== PREFIX || !guardianId || !sig || !UUID.test(guardianId)) return null;
  const expected = Buffer.from(sign(guardianId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? guardianId : null;
}
