import { describe, expect, it, vi } from "vitest";
import { DATA_COLLECTION, sharedOptions } from "./sentry-options";

// SDK 11 ignores sendDefaultPii and collects the person's details, IP address, cookies, headers, bodies and query
// strings unless dataCollection says otherwise; userInfo: false is also what makes envelopes say infer_ip "never".
describe("Sentry's own data collection", () => {
  it("is switched off for everything that can carry personal data, on server and browser alike", () => {
    const options = sharedOptions({ dsn: "https://public@o0.ingest.de.sentry.io/0", environment: "production" });
    expect(options.dataCollection).toBe(DATA_COLLECTION);
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
    expect(options).not.toHaveProperty("sendDefaultPii");
    expect(options.enhanceFetchErrorMessages).toBe(false);
  });
});

const init = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ init, setUser: vi.fn(), captureException: vi.fn(), captureRequestError: vi.fn(), captureRouterTransitionStart: vi.fn() }));

describe("Sentry start-up", () => {
  it("passes the data collection settings on the server, with no trace headers on its own requests", async () => {
    const { initSentryServer } = await import("./sentry-server");
    initSentryServer("https://public@o0.ingest.de.sentry.io/0");
    const options = init.mock.lastCall![0];
    expect(options.dataCollection).toEqual(DATA_COLLECTION);
    expect(options.dataCollection.userInfo).toBe(false);
    expect(options.includeLocalVariables).toBe(false);
    expect(options.tracePropagationTargets).toEqual([]);
  });

  it("passes them in the browser too, sending reports through the app's own /monitoring route", async () => {
    const { initSentryClient } = await import("./sentry-client");
    initSentryClient("https://public@o0.ingest.de.sentry.io/0", "production");
    const options = init.mock.lastCall![0];
    expect(options.dataCollection).toEqual(DATA_COLLECTION);
    expect(options.tunnel).toBe("/monitoring");
    expect(options.transportOptions).toEqual({ fetchOptions: { credentials: "omit" } });
  });
});
