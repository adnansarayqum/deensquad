import { createHmac, timingSafeEqual } from "node:crypto";
import { UUID } from "../auth/tokens";
import { isDemo } from "../db";

// A child's attendance QR code: "DSP.<PLAYER ID>.<SIGNATURE>". The signature is an HMAC with QR_SECRET, so a code
// can't be made up or altered, and it works without signal at the gate (it's just a picture). One code per child, so
// a child who stays home isn't checked in. Changing QR_SECRET cancels every code.
//
// Every character is one a QR code can hold in its compact alphanumeric mode (capitals, digits, "." and "-"): the id
// in capitals and an 80-bit signature in base32. That makes a 29x29 code (version 3) instead of 37x37, so each square
// is bigger on the phone and scans more easily. Codes made before (lower-case id, 22-character base64url signature,
// in screenshots and offline copies) still read.

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

const digest = (playerId: string) => createHmac("sha256", secret()).update(`${PREFIX}.${playerId.toLowerCase()}`).digest();

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 of 10 bytes: 16 characters, no padding. */
function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

const sign = (playerId: string) => base32(digest(playerId).subarray(0, 10));
const legacySign = (playerId: string) => digest(playerId).toString("base64url").slice(0, 22);

export function passToken(playerId: string): string {
  return `${PREFIX}.${playerId.toUpperCase()}.${sign(playerId)}`;
}

/** The player id inside a genuine pass, or null. */
export function readPass(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 120) return null;
  const [prefix, id, sig, ...rest] = token.trim().split(".");
  if (prefix !== PREFIX || !id || !sig || rest.length > 0 || !UUID.test(id)) return null;
  const playerId = id.toLowerCase();
  const expected = Buffer.from(sig.length === 22 ? legacySign(playerId) : sign(playerId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? playerId : null;
}
