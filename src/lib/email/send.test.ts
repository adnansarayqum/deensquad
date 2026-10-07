import { afterEach, describe, expect, it, vi } from "vitest";
import { SEND_TIMEOUT_MS, idempotencyKey, sendEmails, type Email } from "./send";

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

  it("sends an Idempotency-Key on single and batch sends, one per request, made from what's sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "test");
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await sendEmails(emails(1));
    await sendEmails(emails(150));
    const sent = fetch.mock.calls.map((c) => {
      const [url, init] = c as unknown as [string, RequestInit];
      return { url, key: new Headers(init.headers).get("Idempotency-Key"), body: JSON.parse(init.body as string) as unknown };
    });
    expect(sent.map((s) => s.url)).toEqual(["https://api.resend.com/emails", "https://api.resend.com/emails/batch", "https://api.resend.com/emails/batch"]);
    for (const s of sent) expect(s.key).toMatch(/^ds-[0-9a-f]{64}$/);
    expect(new Set(sent.map((s) => s.key)).size).toBe(3);
    // The same request again (a retry after a timeout) has the same key, so Resend doesn't send it twice.
    await sendEmails(emails(1));
    expect(new Headers((fetch.mock.calls[3] as unknown as [string, RequestInit])[1].headers).get("Idempotency-Key")).toBe(sent[0].key);
  });
});

describe("idempotencyKey", () => {
  const invite = (link: string) => ({ from: "club", to: ["sara@example.com"], subject: "Join", text: link, html: link });
  const at = Date.UTC(2026, 9, 7, 10, 5);

  it("is the same for the same email in the same hour", () => {
    expect(idempotencyKey(invite("https://app/sign-in/aaa"), at)).toBe(idempotencyKey(invite("https://app/sign-in/aaa"), at + 50 * 60_000));
  });

  it("changes for a deliberate re-send: a new link, another recipient, or a later hour", () => {
    const key = idempotencyKey(invite("https://app/sign-in/aaa"), at);
    expect(idempotencyKey(invite("https://app/sign-in/bbb"), at)).not.toBe(key);
    expect(idempotencyKey({ ...invite("https://app/sign-in/aaa"), to: ["adnan@example.com"] }, at)).not.toBe(key);
    expect(idempotencyKey(invite("https://app/sign-in/aaa"), at + 60 * 60_000)).not.toBe(key);
  });
});
