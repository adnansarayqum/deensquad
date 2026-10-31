// Errors on people's phones (a crash in a page, a promise nobody caught) reported to the server, which emails them
// like its own errors (src/lib/alerts.ts, at most one email every 30 minutes). Added after the gate scanner stopped
// silently on Fri 30 Oct 2026: its crash reached Sentry but nobody was told. Shared by the browser reporter
// (ClientErrorReporter) and the route (/api/client-error), so both agree on what's worth a report.

/** Errors that aren't faults in the app: a dropped signal, a browser quirk, an extension, a cross-site script. */
const NOISE = [
  /ResizeObserver loop/i,
  /^Load failed/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /network error/i,
  /^Script error\.?$/i,
  /AbortError|The operation was aborted|signal is aborted/i,
  /ChunkLoadError|Loading chunk .* failed|Failed to load chunk/i,
  /NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND/,
  /The play\(\) request was interrupted/i,
  /NotAllowedError/i,
  // Safari's words for a fetch it dropped, e.g. Next's background prefetch of a page cancelled by moving to
  // another one ("Fetch API cannot load …?_rsc=… due to access control checks"), seen in the iPhone tests.
  /due to access control checks/i,
];

export function isNoise(message: string, source?: string | null): boolean {
  if (source && /^(chrome|moz|safari)(-web)?-extension:/.test(source)) return true;
  return NOISE.some((n) => n.test(message));
}

export type ClientErrorReport = { message: string; path: string };

/** What a report may carry: a short message and the page's path, nothing else. */
export function readReport(body: unknown): ClientErrorReport | null {
  if (!body || typeof body !== "object") return null;
  const { message, path } = body as Record<string, unknown>;
  if (typeof message !== "string" || typeof path !== "string" || !message.trim() || !path.startsWith("/")) return null;
  return { message: message.slice(0, 300), path: path.split(/[?#]/)[0].slice(0, 200) };
}

/** At most this many reports from one page load, so a loop that fails every frame can't flood anything. */
export const PER_PAGE = 3;
