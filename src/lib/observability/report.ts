// Small, always-bundled helpers for the browser. They do nothing unless the app was built with
// NEXT_PUBLIC_SENTRY_DSN and Sentry has started (src/instrumentation-client.ts puts it on window).

import type { MonitoringUser } from "./scrub";

type SentryClient = typeof import("./sentry-client");
export type SentryWindow = Window & {
  __dsSentry?: SentryClient;
  __dsSentryUser?: MonitoringUser | null;
  /** Errors caught before Sentry had loaded; sent once it has (src/instrumentation-client.ts). */
  __dsSentryPending?: unknown[];
};

const MAX_PENDING = 5;

function sentryWindow(): SentryWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as SentryWindow);
}

/** Sends one error with the signed-in person (if known) set first. */
export function sendClientError(w: SentryWindow, sentry: SentryClient, error: unknown) {
  if (w.__dsSentryUser !== undefined) sentry.setClientUser(w.__dsSentryUser);
  sentry.captureException(error);
}

/**
 * Sends an error caught by an error boundary (error.tsx, global-error.tsx) to Sentry, when it's on. Not one with a
 * digest: that failed on the server, which has already reported it (src/instrumentation.ts). Waits a moment so the
 * root layout has said who is signed in, and keeps it if Sentry hasn't loaded yet.
 */
export function reportClientError(error: unknown) {
  const w = sentryWindow();
  if (!w) return;
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest) return;
  setTimeout(() => {
    if (w.__dsSentry) sendClientError(w, w.__dsSentry, error);
    else if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      const pending = (w.__dsSentryPending ??= []);
      if (pending.length < MAX_PENDING) pending.push(error);
    }
  }, 0);
}

/** Tags this browser's reports with the signed-in person (opaque id and parent/coach/admin), or clears it. */
export function setMonitoringUser(user: MonitoringUser | null) {
  const w = sentryWindow();
  if (!w) return;
  // Kept for when Sentry finishes loading, if it hasn't yet.
  w.__dsSentryUser = user;
  w.__dsSentry?.setClientUser(user);
}
