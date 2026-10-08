import type { Instrumentation } from "next";
import { sentryServerDsn } from "./lib/observability/config";

// Runs once when the server starts. Copies any linked shop photos into the app in the background,
// so a fresh deploy (or the demo, which starts empty) doesn't depend on links that expire.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  setTimeout(() => {
    import("./lib/shop/images").then((m) => m.localiseProductImages()).catch(() => {});
  }, 5_000);
  // Error reports to Sentry, only when SENTRY_DSN is set in production (src/lib/observability).
  const dsn = sentryServerDsn();
  if (dsn) {
    try {
      const { initSentryServer } = await import("./lib/observability/sentry-server");
      initSentryServer(dsn);
    } catch (error) {
      console.error("[sentry] could not start:", error instanceof Error ? error.message : error);
    }
  }
}

// A page, action or API route failed: email the maintainer (throttled; see src/lib/alerts.ts).
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const err = error as { name?: string; message?: string; digest?: string };
  // Next uses errors to redirect and to show "not found"; those aren't failures.
  if (err.digest?.startsWith("NEXT_REDIRECT") || err.digest?.startsWith("NEXT_HTTP_ERROR_FALLBACK")) return;
  // An action body Next couldn't decode (someone poking at the site): a 500 from Next, not a fault worth a report.
  const { isMalformedActionBody } = await import("./lib/malformed-body");
  if (isMalformedActionBody(err, context.routeType)) return;
  // Sentry too, when it's on (scrubbed and filtered in src/lib/observability/scrub.ts). The email stays as the fallback.
  if (sentryServerDsn()) {
    try {
      const { captureRequestError } = await import("./lib/observability/sentry-server");
      captureRequestError(error, request, context);
    } catch {
      // never let error reporting break anything
    }
  }
  try {
    const { sendErrorAlert } = await import("./lib/alerts");
    await sendErrorAlert({ name: err.name, message: err.message ?? String(error), digest: err.digest, path: request.path, kind: `${context.routeType} ${context.routerKind}` });
  } catch {
    // never let alerting break anything
  }
};
