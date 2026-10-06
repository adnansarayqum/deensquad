import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Database drivers load at runtime from node_modules rather than being bundled.
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  // Session plans and practice sheets can carry an 8 MB PDF or photo.
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
  poweredByHeader: false,
  // Always baked in, empty when unset, so a build without Sentry leaves the browser SDK out altogether
  // (an unset NEXT_PUBLIC_ variable isn't replaced, and the code behind it would be built anyway).
  env: { NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? "" },
  // No other site may show the app in a frame (so it can't be dressed up to trick a parent into tapping),
  // browsers must not guess file types, links out carry no address, and browsers keep to HTTPS.
  // No script-src: the PDF viewer's worker and Next's own scripts would need careful allow-listing.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

// Error tracking (Sentry, src/lib/observability). Sentry's build step is added only when a DSN is set for the
// build, so without one the app is built exactly as before. Source maps are uploaded (then deleted, so they're
// never served) only when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are all set; otherwise none are
// made and the build never contacts Sentry.
const sentryOn = Boolean(process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
const upload = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export function withSentry(config: NextConfig): NextConfig {
  return withSentryConfig(
    {
      ...config,
      // Copied: Sentry adds its own settings to this object.
      experimental: { ...config.experimental },
      // The browser SDK's environment (the server reads SENTRY_ENVIRONMENT when it starts).
      env: { ...config.env, _dsSentryEnvironment: process.env.SENTRY_ENVIRONMENT?.trim() || "production" },
    },
    {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !upload,
      // Nothing about the build is sent to Sentry beyond the source maps.
      telemetry: false,
      // Browser reports go to the app's own address (ad blockers drop requests to sentry.io). src/proxy.ts lets it through.
      tunnelRoute: "/monitoring",
      // The release is the deployed commit (Railway sets RAILWAY_GIT_COMMIT_SHA). Only created in Sentry when uploading.
      release: { name: process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || undefined, create: upload, finalize: upload },
      sourcemaps: upload ? { deleteSourcemapsAfterUpload: true } : { disable: true },
      // Not needed: scrub.ts turns ids in addresses into :id, and this would add every route to every page's JavaScript.
      routeManifestInjection: false,
      // Errors and light tracing only; leave the server bundle as Next builds it.
      buildTimeInstrumentation: false,
    },
  );
}

export default sentryOn ? withSentry(nextConfig) : nextConfig;
