import "server-only";

// Sentry on the server. Loaded by src/instrumentation.ts only when SENTRY_DSN is set in production
// (see config.ts), so without it the SDK never starts.

import { captureRequestError, init, setUser } from "@sentry/nextjs";
import type { MonitoringUser } from "./scrub";
import { sentryEnvironment, sentryRelease } from "./config";
import { sharedOptions } from "./sentry-options";

export function initSentryServer(dsn: string) {
  init({
    ...sharedOptions({ dsn, environment: sentryEnvironment(), release: sentryRelease() }),
    // Never attach the values of local variables to stack frames (they can hold a family's details).
    includeLocalVariables: false,
    // No sentry-trace/baggage headers on the server's own requests (Resend, SumUp, Anthropic, and the /monitoring
    // tunnel's forwarding to Sentry, which must carry the report alone).
    tracePropagationTargets: [],
    // No load-time hooks into other packages (they'd only add timings for database drivers the app doesn't use,
    // and Node 22 can't load them anyway).
    enableRuntimeChannelInjection: false,
  });
}

export { captureRequestError };

/** The signed-in person for this request's reports: an opaque id and parent/coach/admin, nothing else. */
export function setServerUser(user: MonitoringUser | null) {
  setUser(user ? { id: user.id, segment: user.segment } : null);
}
