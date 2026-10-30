"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How often an open register picks up check-ins made on other coaches' phones. */
const EVERY_MS = 20_000;
/** How long the signal check may take before this round is skipped. */
const CHECK_MS = 5_000;

/**
 * Keeps the register current while it's on screen: every 20 s, and as soon as the coach comes back to the app.
 * An installed iPhone app has no pull-to-refresh, so without this another coach's scans never show.
 *
 * It refreshes only when a quick check says the app can be reached: on a weak signal a refresh that fails makes Next
 * load the whole page again, which shows the phone's "no internet" page instead of the register. And never while the
 * scanner is open (it has its own history entry), so a refresh can't interrupt a scan.
 */
export function RegisterAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let checking = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || navigator.onLine === false || checking) return;
      if ((history.state as { scanner?: unknown } | null)?.scanner) return;
      checking = true;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), CHECK_MS);
      try {
        const res = await fetch("/api/health", { cache: "no-store", signal: abort.signal });
        if (res.ok && !(history.state as { scanner?: unknown } | null)?.scanner) router.refresh();
      } catch {
        // No signal just now: try again next time.
      } finally {
        clearTimeout(timer);
        checking = false;
      }
    };
    const timer = setInterval(refresh, EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
