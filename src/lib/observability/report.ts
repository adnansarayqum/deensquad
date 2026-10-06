// Small, always-bundled helpers for the browser. They do nothing unless the app was built with
// NEXT_PUBLIC_SENTRY_DSN and Sentry has started (src/instrumentation-client.ts puts it on window).

import type { MonitoringUser } from "./scrub";

type SentryClient = typeof import("./sentry-client");
export type SentryWindow = Window & { __dsSentry?: SentryClient; __dsSentryUser?: MonitoringUser | null };

function sentry(): SentryClient | undefined {
  return typeof window === "undefined" ? undefined : (window as SentryWindow).__dsSentry;
}

/** Sends an error caught by an error boundary (error.tsx, global-error.tsx) to Sentry, when it's on. */
export function reportClientError(error: unknown) {
  sentry()?.captureException(error);
}

/** Tags this browser's reports with the signed-in person (opaque id and parent/coach/admin), or clears it. */
export function setMonitoringUser(user: MonitoringUser | null) {
  if (typeof window === "undefined") return;
  // Kept for when Sentry finishes loading, if it hasn't yet.
  (window as SentryWindow).__dsSentryUser = user;
  sentry()?.setClientUser(user);
}
