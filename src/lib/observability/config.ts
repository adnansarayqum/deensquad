// Which of error tracking (Sentry) and page counting (Plausible or Umami) are on. Both are off unless
// their variables are set; with nothing set the app sends nothing anywhere new.
//
// Sentry is decided at build time for the browser (NEXT_PUBLIC_SENTRY_DSN is baked into the bundle, so the
// SDK isn't even built in without it, and next.config.ts only adds Sentry's build step when a DSN is set) and at
// start-up for the server (SENTRY_DSN). Analytics is read on the server for every page from the variables
// below, so changing them needs only a restart, not a code change.

/** Reads a variable at run time. A literal `process.env.NEXT_PUBLIC_X` would be baked in at build time instead. */
function runtime(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

const production = () => process.env.NODE_ENV === "production";

/** The server reports errors: SENTRY_DSN is set and this is a production build. */
export function sentryServerDsn(): string | null {
  return production() ? (runtime("SENTRY_DSN") ?? null) : null;
}

/** The browser reports errors: NEXT_PUBLIC_SENTRY_DSN was set when the app was built. */
export const SENTRY_CLIENT_ON = process.env.NODE_ENV === "production" && Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

/** "production" unless SENTRY_ENVIRONMENT says otherwise (the demo service sets "demo"). */
export function sentryEnvironment(): string {
  return runtime("SENTRY_ENVIRONMENT") ?? "production";
}

/** The deployed commit, which Sentry uses as the release. */
export function sentryRelease(): string | undefined {
  return runtime("RAILWAY_GIT_COMMIT_SHA");
}

/** Whether the privacy notice should list Sentry. */
export function sentryConfigured(): boolean {
  return Boolean(sentryServerDsn()) || SENTRY_CLIENT_ON;
}

export type AnalyticsConfig = { provider: "plausible"; domain: string; src: string } | { provider: "umami"; websiteId: string; src: string };

export const PLAUSIBLE_DEFAULT_SRC = "https://plausible.io/js/script.manual.js";

function scriptUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * NEXT_PUBLIC_ANALYTICS = "plausible" (with NEXT_PUBLIC_PLAUSIBLE_DOMAIN, optional NEXT_PUBLIC_PLAUSIBLE_SRC) or
 * "umami" (with NEXT_PUBLIC_UMAMI_WEBSITE_ID and NEXT_PUBLIC_UMAMI_SRC). Anything missing or unknown: off.
 */
export function analyticsConfig(): AnalyticsConfig | null {
  const provider = runtime("NEXT_PUBLIC_ANALYTICS")?.toLowerCase();
  if (provider === "plausible") {
    const domain = runtime("NEXT_PUBLIC_PLAUSIBLE_DOMAIN");
    const src = scriptUrl(runtime("NEXT_PUBLIC_PLAUSIBLE_SRC") ?? PLAUSIBLE_DEFAULT_SRC);
    return domain && src ? { provider, domain, src } : null;
  }
  if (provider === "umami") {
    const websiteId = runtime("NEXT_PUBLIC_UMAMI_WEBSITE_ID");
    const src = scriptUrl(runtime("NEXT_PUBLIC_UMAMI_SRC"));
    return websiteId && src ? { provider, websiteId, src } : null;
  }
  return null;
}
