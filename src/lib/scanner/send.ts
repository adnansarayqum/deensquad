import type { ScanResult } from "../staff/checkin";

// Sends one code to the club and says what came back. Three outcomes and no others: the server's answer, signed
// out, or no answer (no signal, a timeout, a server fault), so the scanner never has to guess. Never throws.

/** A scan with no answer after this long counts as no signal, so a hung request never freezes the scanner. */
export const SCAN_TIMEOUT_MS = 10_000;

export type Sent = { kind: "answer"; result: ScanResult } | { kind: "signedOut" } | { kind: "noAnswer" };

function isScanResult(value: unknown): value is ScanResult {
  if (!value || typeof value !== "object") return false;
  const v = value as { ok?: unknown; child?: unknown; reason?: unknown };
  return v.ok === true ? typeof v.child === "object" && v.child !== null : v.ok === false && typeof v.reason === "string";
}

/** Checks the child in through /api/coach/scan (a route, which unlike a Server Action never queues behind a stuck request). */
export async function sendCode(token: string, fetchFn: typeof fetch = fetch, timeoutMs = SCAN_TIMEOUT_MS): Promise<Sent> {
  // A plain timer, not AbortSignal.timeout(), which older iPhones (iOS 15) don't have.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetchFn("/api/coach/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: abort.signal,
    });
    // Signed out comes back as a 401 or, through the proxy, a redirect to the sign-in page.
    if (res.status === 401 || res.redirected) return { kind: "signedOut" };
    if (!res.ok) return { kind: "noAnswer" };
    const body: unknown = await res.json().catch(() => null);
    // Anything that isn't the server's own answer (a captive wifi page, a half-sent reply) is no answer, never a check-in.
    return isScanResult(body) ? { kind: "answer", result: body } : { kind: "noAnswer" };
  } catch {
    return { kind: "noAnswer" };
  } finally {
    clearTimeout(timer);
  }
}
