// Sentry in the browser. Loaded on demand by src/instrumentation-client.ts, and only in a production build
// made with NEXT_PUBLIC_SENTRY_DSN, so without it this file (and the SDK) is never sent to anyone's phone.
// No Session Replay and no feedback widget: neither is added here.

import { captureException, captureRouterTransitionStart, init, setUser } from "@sentry/nextjs";
import type { MonitoringUser } from "./scrub";
import { sharedOptions } from "./sentry-options";

export function initSentryClient(dsn: string, environment: string) {
  init({
    ...sharedOptions({ dsn, environment }),
    // The release (the deployed commit) is added at build time by withSentryConfig in next.config.ts.
    // Reports go through the app's own /monitoring route (so ad blockers don't drop them; src/app/monitoring),
    // which passes on only the report, never the visitor's IP address or headers. No cookies are sent to it either.
    tunnel: "/monitoring",
    transportOptions: { fetchOptions: { credentials: "omit" } },
    // Errors from browser extensions aren't ours.
    denyUrls: [/^(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i],
  });
}

export { captureException, captureRouterTransitionStart };

export function setClientUser(user: MonitoringUser | null) {
  setUser(user ? { id: user.id, segment: user.segment } : null);
}
