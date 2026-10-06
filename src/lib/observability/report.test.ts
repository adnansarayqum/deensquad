// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportClientError, sendClientError, setMonitoringUser, type SentryWindow } from "./report";

const w = window as SentryWindow;
const fakeSentry = () => ({ captureException: vi.fn(), setClientUser: vi.fn(), captureRouterTransitionStart: vi.fn(), initSentryClient: vi.fn() });

afterEach(() => {
  delete w.__dsSentry;
  delete w.__dsSentryUser;
  delete w.__dsSentryPending;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("reportClientError", () => {
  it("leaves errors with a digest to the server, which has already reported them", () => {
    vi.useFakeTimers();
    const sentry = fakeSentry();
    w.__dsSentry = sentry as never;
    reportClientError(Object.assign(new Error("An error occurred in the Server Components render"), { digest: "123456" }));
    vi.runAllTimers();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("sends a browser error with the signed-in person set first, once the layout has said who that is", () => {
    vi.useFakeTimers();
    const sentry = fakeSentry();
    w.__dsSentry = sentry as never;
    const error = new Error("render boom");
    reportClientError(error);
    // The root layout's effect runs after the error page's in the same commit.
    setMonitoringUser({ id: "u1", segment: "parent" });
    sentry.setClientUser.mockClear();
    vi.runAllTimers();
    expect(sentry.setClientUser).toHaveBeenCalledWith({ id: "u1", segment: "parent" });
    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(sentry.setClientUser.mock.invocationCallOrder[0]).toBeLessThan(sentry.captureException.mock.invocationCallOrder[0]);
  });

  it("keeps errors caught before Sentry has loaded, for it to send", () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@o0.ingest.de.sentry.io/0");
    const error = new Error("early boom");
    reportClientError(error);
    vi.runAllTimers();
    expect(w.__dsSentryPending).toEqual([error]);
    const sentry = fakeSentry();
    for (const e of w.__dsSentryPending!.splice(0)) sendClientError(w, sentry as never, e);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });
});
