import { afterEach, describe, expect, it, vi } from "vitest";
import { SEND_TIMEOUT_MS, requestKey, sendEmails, type Email } from "./send";

const emails = (n: number): Email[] => Array.from({ length: n }, (_, i) => ({ to: `p${i}@example.com`, subject: "Hi", text: "t", html: "h" }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendEmails", () => {
  it("reports a failed batch as not sent and keeps the batches that went", async () => {
    vi.stubEnv("RESEND_API_KEY", "test");
    const fetch = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("server error", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const all = emails(150);
    const report = await sendEmails(all);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(report.sent).toEqual(all.slice(0, 100));
    expect(report.failed).toEqual(all.slice(100));
  });

  it("waits and tries again when Resend says too many requests, up to twice", async () => {
    vi.stubEnv("RESEND_API_KEY", "test");
    const limited = () => new Response("rate limited", { status: 429, headers: { "retry-after": "0.01" } });
    const fetch = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await sendEmails(emails(1))).toMatchObject({ sent: [{ to: "p0@example.com" }], failed: [] });
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.spyOn(console, "error").mockImplementation(() => {});
    const always = vi.fn().mockImplementation(async () => limited());
    vi.stubGlobal("fetch", always);
    expect(await sendEmails(emails(1))).toMatchObject({ sent: [], failed: [{ to: "p0@example.com" }] });
    expect(always).toHaveBeenCalledTimes(3);
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

  it("sends no Idempotency-Key unless the caller gives one", async () => {
    vi.stubEnv("RESEND_API_KEY", "test");
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendEmails(emails(1));
    await sendEmails(emails(3));
    for (const c of fetch.mock.calls) expect(new Headers((c as unknown as [string, RequestInit])[1].headers).has("Idempotency-Key")).toBe(false);
  });

  it("sends the caller's key, never as part of the email, and the same key on a retry", async () => {
    vi.stubEnv("RESEND_API_KEY", "test");
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const keyed = (n: number, announcement: string) => emails(n).map((e, i) => ({ ...e, idempotencyKey: `${announcement}:g${i}:email` }));
    await sendEmails(keyed(1, "a1"));
    await sendEmails(keyed(1, "a1")); // the next hourly run
    await sendEmails(keyed(1, "a2")); // another message
    await sendEmails(keyed(3, "a1")); // a batch
    await sendEmails(keyed(3, "a1"));
    const calls = fetch.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1]);
    const keys = calls.map((init) => new Headers(init.headers).get("Idempotency-Key"));
    expect(keys.slice(0, 3)).toEqual(["a1:g0:email", "a1:g0:email", "a2:g0:email"]);
    expect(keys[3]).toMatch(/^batch-[0-9a-f]{64}$/);
    expect(keys[4]).toBe(keys[3]);
    for (const init of calls) expect(init.body as string).not.toContain("idempotencyKey");
  });

  it("counts a 409 for a keyed email as already sent, and an unkeyed 409 as not sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid_idempotent_request", { status: 409 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const keyed = { ...emails(1)[0], idempotencyKey: "a1:g0:email" };
    expect(await sendEmails([keyed])).toEqual({ sent: [keyed], failed: [] });
    expect(await sendEmails(emails(1))).toEqual({ sent: [], failed: emails(1) });
  });
});

describe("requestKey", () => {
  const e = (key?: string) => ({ to: "x@example.com", subject: "s", text: "t", html: "h", idempotencyKey: key });
  it("is null unless every email in the request has a key", () => {
    expect(requestKey([e()])).toBeNull();
    expect(requestKey([e("a"), e()])).toBeNull();
    expect(requestKey([e("a")])).toBe("a");
    expect(requestKey([e("a"), e("b")])).toBe(requestKey([e("a"), e("b")]));
    expect(requestKey([e("a"), e("b")])).not.toBe(requestKey([e("a"), e("c")]));
  });
});
