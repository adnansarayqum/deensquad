import { describe, expect, it, vi } from "vitest";
import { destination, forwardEnvelope, MAX_ENVELOPE_BYTES } from "./tunnel";

const DSN = "https://public@o0.ingest.de.sentry.io/0";
const envelope = (dsn: string) => `${JSON.stringify({ event_id: "abc", dsn })}\n{"type":"event"}\n{"message":"boom"}\n`;

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request("https://app.example/monitoring", {
    method: "POST",
    body,
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "x-real-ip": "203.0.113.7",
      cookie: "ds_session=secret",
      "user-agent": "Mozilla/5.0 (iPhone)",
      ...headers,
    },
  });
}

describe("destination", () => {
  it("is Sentry's envelope address for the DSN's host and project", () => {
    expect(destination(DSN)).toEqual({ host: "o0.ingest.de.sentry.io", projectId: "0", url: "https://o0.ingest.de.sentry.io/api/0/envelope/" });
    expect(destination("https://key@sentry.example/prefix/42")?.url).toBe("https://sentry.example/prefix/api/42/envelope/");
    expect(destination("")).toBeNull();
    expect(destination("not a dsn")).toBeNull();
    expect(destination("https://o0.ingest.de.sentry.io/0")).toBeNull();
  });
});

describe("forwardEnvelope", () => {
  it("passes a report for our project on to Sentry with only its content type: no IP address, cookie or user agent", async () => {
    const send = vi.fn(async () => new Response("{}", { status: 200, headers: { "x-sentry-rate-limits": "60:error:organization", "set-cookie": "x=1" } }));
    const res = await forwardEnvelope(post(envelope(DSN)), DSN, send as typeof fetch);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-sentry-rate-limits")).toBe("60:error:organization");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(send).toHaveBeenCalledOnce();
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o0.ingest.de.sentry.io/api/0/envelope/");
    expect(init.headers).toEqual({ "content-type": "text/plain;charset=UTF-8" });
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe(envelope(DSN));
  });

  it("passes on Sentry's own refusal", async () => {
    const send = vi.fn(async () => new Response(null, { status: 429, headers: { "retry-after": "60" } }));
    const res = await forwardEnvelope(post(envelope(DSN)), DSN, send as typeof fetch);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("refuses reports for another Sentry organisation, host or project, and sends nothing", async () => {
    const send = vi.fn();
    for (const other of ["https://public@o1.ingest.de.sentry.io/0", "https://public@o0.ingest.de.sentry.io/5", "https://public@evil.example/0"]) {
      expect((await forwardEnvelope(post(envelope(other)), DSN, send)).status).toBe(403);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses something that isn't a report", async () => {
    const send = vi.fn();
    expect((await forwardEnvelope(post("hello"), DSN, send)).status).toBe(400);
    expect((await forwardEnvelope(post('{"event_id":"abc"}\n{}'), DSN, send)).status).toBe(400);
    expect((await forwardEnvelope(post('{"dsn":"nope"}\n{}'), DSN, send)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses anything over 1 MB, whatever its declared length", async () => {
    const send = vi.fn();
    const big = envelope(DSN) + "x".repeat(MAX_ENVELOPE_BYTES);
    expect((await forwardEnvelope(post(big), DSN, send)).status).toBe(413);
    // Streamed with no content length.
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const streamed = new Request("https://app.example/monitoring", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect((await forwardEnvelope(streamed, DSN, send)).status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });

  it("is not there when Sentry is off, and says so when Sentry can't be reached", async () => {
    const send = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect((await forwardEnvelope(post(envelope(DSN)), null, send as typeof fetch)).status).toBe(404);
    expect((await forwardEnvelope(post(envelope(DSN)), "", send as typeof fetch)).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
    expect((await forwardEnvelope(post(envelope(DSN)), DSN, send as typeof fetch)).status).toBe(502);
  });
});
