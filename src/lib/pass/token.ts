import { createHmac, timingSafeEqual } from "node:crypto";
import { UUID } from "../auth/tokens";
import { isDemo } from "../db";

// A child's gate pass: "DSP.<player id>.<signature>". The signature is an HMAC with QR_SECRET,
// so a pass can't be made up or altered, and it works without signal at the gate (it's just a picture).
// One pass per child, so a child who stays home isn't checked in. Changing QR_SECRET cancels every pass.

const PREFIX = "DSP";

/**
 * QR_SECRET, or a fixed stand-in outside production and in the demo (`isDemo()`: DEMO_MODE with an in-memory
 * database). Never for a real database in production: DEMO_MODE alone doesn't unlock it there.
 */
function secret(): string {
  const s = process.env.QR_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production" || isDemo()) return "development-only-qr-secret";
  throw new Error("QR_SECRET is not set.");
}

function sign(playerId: string): string {
  return createHmac("sha256", secret()).update(`${PREFIX}.${playerId}`).digest("base64url").slice(0, 22);
}

export function passToken(playerId: string): string {
  return `${PREFIX}.${playerId}.${sign(playerId)}`;
}

/** The player id inside a genuine pass, or null. */
export function readPass(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const [prefix, playerId, sig] = token.trim().split(".");
  if (prefix !== PREFIX || !playerId || !sig || !UUID.test(playerId)) return null;
  const expected = Buffer.from(sign(playerId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? playerId : null;
}
