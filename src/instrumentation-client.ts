// Runs in the browser before the app starts. Error tracking (Sentry) only: see src/lib/observability.
// Off unless the app was built with NEXT_PUBLIC_SENTRY_DSN (next.config.ts bakes it in, empty when unset,
// so without it the SDK isn't built at all). With it, the SDK loads in its own chunk just after the page
// starts, so it adds nothing to what every screen downloads first.

import { sendClientError, type SentryWindow } from "./lib/observability/report";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import("./lib/observability/sentry-client")
    .then((m) => {
      if (process.env.NODE_ENV !== "production") return;
      // SENTRY_ENVIRONMENT, read when the app was built (next.config.ts).
      m.initSentryClient(process.env.NEXT_PUBLIC_SENTRY_DSN!, process.env._dsSentryEnvironment || "production");
      const w = window as SentryWindow;
      w.__dsSentry = m;
      if (w.__dsSentryUser !== undefined) m.setClientUser(w.__dsSentryUser);
      // Errors an error page caught before Sentry had loaded.
      for (const error of w.__dsSentryPending?.splice(0) ?? []) sendClientError(w, m, error);
    })
    .catch(() => {});
}

/** Lets Sentry time in-app navigations (5% of them are traced). Does nothing when Sentry is off. */
export function onRouterTransitionStart(url: string, navigationType: "push" | "replace" | "traverse") {
  (window as SentryWindow).__dsSentry?.captureRouterTransitionStart(url, navigationType);
}
