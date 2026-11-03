// Refreshing the register safely on a weak signal (error-state review, 3 Nov 2026). A refresh whose request fails
// makes Next load the whole page again, which shows the phone's "no internet" page instead of the register, and a
// refresh that hangs holds up Next's router. So every register refresh first checks the app can be reached, and
// none runs while the scanner is open.

/** How long the signal check may take before this refresh is skipped (the 20 s auto-refresh catches up). */
export const CHECK_MS = 5_000;

let scannerOpen = false;

/** The scanner says when it opens and closes: kept here, not in history.state, which a reload can leave behind. */
export function setScannerOpen(open: boolean): void {
  scannerOpen = open;
}

export function isScannerOpen(): boolean {
  return scannerOpen;
}

/**
 * Refreshes when /api/health answers within 5 s and the scanner isn't open; otherwise does nothing (the next round
 * picks it up). Never throws, never waits on the refresh itself. Returns whether it refreshed.
 */
export async function refreshIfReachable(refresh: () => void): Promise<boolean> {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (scannerOpen) return false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CHECK_MS);
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: abort.signal });
    if (!res.ok || scannerOpen) return false;
    refresh();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
