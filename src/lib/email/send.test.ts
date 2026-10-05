import { afterEach, describe, expect, it, vi } from "vitest";
import { SEND_TIMEOUT_MS, sendEmails, type Email } from "./send";

const emails = (n: number): Email[] => Array.from({ length: n }, (_, i) => ({ to: `p${i}@example.com`, subject: "Hi", text: "t", html: "h" }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendEmails", () => {
  it("reports a failed batch as not sent and keeps the batches that went", async () => {
    vi.stubEnv("RESEND_API_KEY", "test");
    const fetch = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const all = emails(150);
    const report = await sendEmails(all);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(report.sent).toEqual(all.slice(0, 100));
    expect(report.failed).toEqual(all.slice(100));
  });

  it("gives up on a request that hangs and counts it as not sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "test");
    const real = AbortSignal.timeout.bind(AbortSignal);
    const asked: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      asked.push(ms);
      return real(20); // the real timeout, shortened so the test doesn't wait ten seconds
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const report = await sendEmails(emails(1));
    expect(asked).toEqual([SEND_TIMEOUT_MS]);
    expect(SEND_TIMEOUT_MS).toBe(10_000);
    expect(report).toMatchObject({ sent: [], failed: [{ to: "p0@example.com" }] });
  });
});
