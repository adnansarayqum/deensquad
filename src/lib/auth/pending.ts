import "server-only";

import { cookies } from "next/headers";
import { PENDING_COOKIE, safeNext } from "./cookies";

/**
 * The sign-in in progress on this device: which request the code is for, the masked address it went to, and
 * whether it follows sign-up (`signUp`: the code screen then says the family is added once the code is entered).
 */
export type Pending = { id: string; to: string; next: string; signUp?: boolean };

export async function readPending(): Promise<Pending | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Pending>;
    return typeof p.id === "string" && typeof p.to === "string" ? { id: p.id, to: p.to, next: safeNext(p.next), signUp: p.signUp === true } : null;
  } catch {
    return null;
  }
}
