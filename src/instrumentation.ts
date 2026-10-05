import type { Instrumentation } from "next";

// Runs once when the server starts. Copies any linked shop photos into the app in the background,
// so a fresh deploy (or the demo, which starts empty) doesn't depend on links that expire.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  setTimeout(() => {
    import("./lib/shop/images").then((m) => m.localiseProductImages()).catch(() => {});
  }, 5_000);
}

// A page, action or API route failed: email the maintainer (throttled; see src/lib/alerts.ts).
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const err = error as { message?: string; digest?: string };
  // Next uses errors to redirect and to show "not found"; those aren't failures.
  if (err.digest?.startsWith("NEXT_REDIRECT") || err.digest?.startsWith("NEXT_HTTP_ERROR_FALLBACK")) return;
  try {
    const { sendErrorAlert } = await import("./lib/alerts");
    await sendErrorAlert({ message: err.message ?? String(error), digest: err.digest, path: request.path, kind: `${context.routeType} ${context.routerKind}` });
  } catch {
    // never let alerting break anything
  }
};
