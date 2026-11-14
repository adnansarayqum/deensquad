import { describe, expect, it } from "vitest";
import { sendCode } from "./send";

const answer = (body: unknown, init: ResponseInit = {}) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init })) as unknown as typeof fetch;

describe("sending a code to the club", () => {
  it("returns the server's answer, checked in or refused", async () => {
    const ok = { ok: true, child: { id: "c1" } };
    expect(await sendCode("DSP.A", answer(ok))).toEqual({ kind: "answer", result: ok });
    const no = { ok: false, reason: "not_a_pass" };
    expect(await sendCode("nope", answer(no))).toEqual({ kind: "answer", result: no });
  });

  it("sends the code as JSON to the scan route", async () => {
    let seen: { url: string; body: string } | null = null;
    const spy = (async (url: string, init: RequestInit) => {
      seen = { url, body: String(init.body) };
      return new Response(JSON.stringify({ ok: false, reason: "not_a_pass" }));
    }) as unknown as typeof fetch;
    await sendCode("DSP.A", spy);
    expect(seen).toEqual({ url: "/api/coach/scan", body: '{"token":"DSP.A"}' });
  });

  it("says signed out for a 401 or a redirect to the sign-in page", async () => {
    expect(await sendCode("DSP.A", answer({}, { status: 401 }))).toEqual({ kind: "signedOut" });
    const redirected = (async () => Object.defineProperty(new Response("<html>Sign in</html>"), "redirected", { value: true })) as unknown as typeof fetch;
    expect(await sendCode("DSP.A", redirected)).toEqual({ kind: "signedOut" });
  });

  it("counts a server fault, a failed request, a page that isn't the club's answer and a timeout as no answer: never a check-in", async () => {
    expect(await sendCode("DSP.A", answer({}, { status: 500 }))).toEqual({ kind: "noAnswer" });
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await sendCode("DSP.A", offline)).toEqual({ kind: "noAnswer" });
    const wifiPage = (async () => new Response("<html>Sign in to the venue's wifi</html>")) as unknown as typeof fetch;
    expect(await sendCode("DSP.A", wifiPage)).toEqual({ kind: "noAnswer" });
    expect(await sendCode("DSP.A", answer({ hello: "world" }))).toEqual({ kind: "noAnswer" });
    const hangs = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    expect(await sendCode("DSP.A", hangs, 30)).toEqual({ kind: "noAnswer" });
  });
});
