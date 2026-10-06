import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsConfig, PLAUSIBLE_DEFAULT_SRC, sentryEnvironment, sentryServerDsn } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("analyticsConfig", () => {
  it("is off unless a provider and its details are set", () => {
    expect(analyticsConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS", "plausible");
    expect(analyticsConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS", "matomo");
    expect(analyticsConfig()).toBeNull();
  });

  it("reads Plausible, with the manual script by default", () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS", "plausible");
    vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_DOMAIN", "app.example");
    expect(analyticsConfig()).toEqual({ provider: "plausible", domain: "app.example", src: PLAUSIBLE_DEFAULT_SRC });
  });

  it("reads Umami, which needs both the website id and the script address", () => {
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS", "umami");
    vi.stubEnv("NEXT_PUBLIC_UMAMI_WEBSITE_ID", "site-1");
    expect(analyticsConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_UMAMI_SRC", "javascript:alert(1)");
    expect(analyticsConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_UMAMI_SRC", "https://cloud.umami.is/script.js");
    expect(analyticsConfig()).toEqual({ provider: "umami", websiteId: "site-1", src: "https://cloud.umami.is/script.js" });
  });
});

describe("sentry settings", () => {
  it("reports from the server only in production with a DSN", () => {
    vi.stubEnv("SENTRY_DSN", "https://public@o0.ingest.de.sentry.io/0");
    vi.stubEnv("NODE_ENV", "development");
    expect(sentryServerDsn()).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(sentryServerDsn()).toBe("https://public@o0.ingest.de.sentry.io/0");
  });

  it("calls the environment production unless told otherwise", () => {
    expect(sentryEnvironment()).toBe("production");
    vi.stubEnv("SENTRY_ENVIRONMENT", "demo");
    expect(sentryEnvironment()).toBe("demo");
  });
});
