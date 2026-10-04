import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 256-bit random token for sign-in links and session cookies. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Six digits, leading zeros kept. */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The code is hashed with its request id, so the same code in two requests hashes differently. */
export function codeHash(requestId: string, code: string): string {
  return sha256(`${requestId}:${code}`);
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Lower-cased, trimmed email, or null if it doesn't look like one. */
export function normaliseEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** "a•••@gmail.com", so a screen can confirm where a code went without showing the whole address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cleanCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\D/g, "");
  return digits.length === 6 ? digits : null;
}
