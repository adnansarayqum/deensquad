"use client";

import { useEffect } from "react";
import { isNoise, PER_PAGE } from "@/lib/observability/client-errors";
import { scrubText } from "@/lib/observability/scrub";

/**
 * Tells the server about errors on this phone that nothing caught (window `error` and `unhandledrejection`), so they're
 * emailed to the club's maintainer like server errors. Only the page's path and the error's message, scrubbed of
 * emails, ids and query strings; at most three a page. Errors shown by an error page are sent by `reportToServer`.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportToServer(e.error ?? e.message, e.filename);
    const onRejection = (e: PromiseRejectionEvent) => reportToServer(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

let sent = 0;

/** Sends one error report to /api/client-error (signed-in people only; the server ignores the rest). Never throws. */
export function reportToServer(error: unknown, source?: string | null) {
  try {
    const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
    if (!raw.trim() || isNoise(raw, source) || sent >= PER_PAGE) return;
    sent++;
    const body = JSON.stringify({ message: scrubText(raw).slice(0, 300), path: scrubText(location.pathname) });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/client-error", blob)) {
      void fetch("/api/client-error", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    // Reporting must never break the page.
  }
}
