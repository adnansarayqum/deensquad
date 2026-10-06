import { describe, expect, it } from "vitest";
import type { ErrorEvent, Event } from "@sentry/nextjs";
import { beforeSend, isIgnored, scrubBreadcrumb, scrubEvent, scrubSpan, scrubText, scrubUiSelector } from "./scrub";

const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

describe("scrubEvent", () => {
  it("removes the query string from the request URL and turns ids into :id", () => {
    const out = scrubEvent({ request: { url: `https://app.example/admin/families/${ID}?need=contract&q=Khan` } } as Event);
    expect(out.request?.url).toBe("https://app.example/admin/families/:id");
  });

  it("drops cookies, request bodies and every header but the user agent", () => {
    const out = scrubEvent({
      request: {
        url: "https://app.example/checklist/contacts",
        method: "POST",
        cookies: { ds_session: "secret" },
        data: "name=Sana+Khan&phone=07700900123",
        query_string: "child=abc",
        env: { REMOTE_ADDR: "1.2.3.4" },
        headers: { Cookie: "ds_session=secret", Referer: "https://app.example/news?child=abc", "User-Agent": "Mozilla/5.0 (iPhone)", "x-real-ip": "1.2.3.4" },
      },
    } as Event);
    expect(out.request).toEqual({ url: "https://app.example/checklist/contacts", method: "POST", headers: { "user-agent": "Mozilla/5.0 (iPhone)" } });
  });

  it("removes email addresses from messages, exceptions and breadcrumbs", () => {
    const out = scrubEvent({
      message: "No guardian for sana.khan@example.co.uk",
      exception: { values: [{ type: "Error", value: "Could not email Parent@Example.com about it" }] },
      breadcrumbs: [{ category: "console", message: "invite failed for a.b+c@club.org.uk", data: { arguments: ["to sana@example.com"] } }],
    } as Event);
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/@example|@club|@Example/);
    expect(out.message).toBe("No guardian for [email]");
    expect(out.exception?.values?.[0].value).toBe("Could not email [email] about it");
    expect(out.breadcrumbs?.[0].message).toBe("invite failed for [email]");
  });

  it("reduces the user to the opaque id and segment", () => {
    const out = scrubEvent({ user: { id: ID, segment: "parent", email: "sana@example.com", username: "Sana", ip_address: "1.2.3.4" } } as Event);
    expect(out.user).toEqual({ id: ID, segment: "parent" });
    expect(scrubEvent({ user: { email: "sana@example.com" } } as Event).user).toBeUndefined();
    expect(scrubEvent({ user: { id: ID, segment: "owner" } } as Event).user).toBeUndefined();
  });

  it("scrubs transaction names, span details, breadcrumb URLs and contexts", () => {
    const out = scrubEvent({
      transaction: `GET /files/${ID}`,
      spans: [{ description: `GET https://api.example/v1/thing?key=abc`, data: { "url.full": `https://app.example/api/files/${ID}?download=1` } }],
      breadcrumbs: [
        { category: "navigation", data: { from: "/sign-in/link?token=Zx9_Qw-12345678901234567890", to: `/admin/families/${ID}?need=contract` } },
        { category: "fetch", data: { url: `/news?_rsc=1x2y&child=${ID}`, method: "GET", status_code: 200 } },
      ],
      contexts: { nextjs: { request_path: `/files/${ID}?from=/friday`, route_type: "render" } },
    } as unknown as Event);
    expect(out.transaction).toBe("GET /files/:id");
    expect(out.spans?.[0].description).toBe("GET https://api.example/v1/thing");
    expect(out.spans?.[0].data).toEqual({ "url.full": "https://app.example/api/files/:id" });
    expect(out.breadcrumbs?.[0].data).toEqual({ from: "/sign-in/link", to: "/admin/families/:id" });
    expect(out.breadcrumbs?.[1].data).toEqual({ url: "/news", method: "GET", status_code: 200 });
    expect(out.contexts?.nextjs).toEqual({ request_path: "/files/:id", route_type: "render" });
  });

  it("doesn't change the event it was given", () => {
    const event = { message: "for sana@example.com", request: { url: "https://app.example/news?x=1", cookies: { a: "b" } } } as Event;
    const copy = structuredClone(event);
    scrubEvent(event);
    expect(event).toEqual(copy);
  });
});

describe("scrubText", () => {
  it("keeps punctuation after an address and the rest of the sentence", () => {
    expect(scrubText("Failed to load https://app.example/news?child=abc.")).toBe("Failed to load https://app.example/news.");
    expect(scrubText(`fetch /api/files/${ID}?download=1 failed`)).toBe("fetch /api/files/:id failed");
  });
});

describe("scrubBreadcrumb", () => {
  it("scrubs a breadcrumb on its own", () => {
    expect(scrubBreadcrumb({ category: "ui.click", message: "button.btn-chunky" })).toEqual({ category: "ui.click", message: "button.btn-chunky" });
    expect(scrubBreadcrumb({ category: "xhr", data: { url: "https://app.example/x?y=1" } }).data).toEqual({ url: "https://app.example/x" });
  });

  it("keeps only tags and classes of a clicked or typed-in element: no labels, titles, values or ids that name a child", () => {
    const click = scrubBreadcrumb({
      category: "ui.click",
      message: `main.flex > div.card > button.btn-chunky.btn-grass[aria-label="Mark Ahmed K. here"]`,
      data: { textContent: "Mark Ahmed K. here" },
    });
    expect(click).toEqual({ category: "ui.click", message: "main.flex > div.card > button.btn-chunky.btn-grass" });
    const input = scrubBreadcrumb({
      category: "ui.input",
      message: `form > input#child-Yusuf-Khan.field[name="Yusuf's initials"][placeholder='e.g. YK'][value="YK"]`,
    });
    expect(input.message).toBe("form > input.field");
    for (const attr of ["aria-label", "title", "alt", "name", "placeholder", "value", "data-sentry-component"]) {
      expect(scrubUiSelector(`img.photo[${attr}="Sana Khan, U10"]`)).toBe("img.photo");
    }
    // A label with a ] in it, an unclosed bracket, and a Tailwind class with brackets.
    expect(scrubUiSelector(`a.text-[15px][title="Ahmed [U10] K"] > span[title="Bilal`)).toBe("a.text- > span");
    expect(JSON.stringify(scrubBreadcrumb({ category: "ui.click", message: `li[alt='Musa Ali']` }))).not.toMatch(/Musa|Ali/);
  });
});

describe("isIgnored / beforeSend", () => {
  const err = (value: string, filename?: string) =>
    ({ exception: { values: [{ type: "Error", value, ...(filename ? { stacktrace: { frames: [{ filename }] } } : {}) }] } }) as ErrorEvent;

  it("drops Next's redirect and not-found signals", () => {
    expect(isIgnored(err("NEXT_REDIRECT"), { originalException: Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" }) })).toBe(true);
    expect(isIgnored(err("x"), { originalException: Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }) })).toBe(true);
  });

  it("drops a visitor leaving early and common browser noise", () => {
    expect(isIgnored(err("The destination stream closed early."))).toBe(true);
    expect(isIgnored(err("ResizeObserver loop completed with undelivered notifications."))).toBe(true);
    expect(isIgnored(err("Load failed"))).toBe(true);
    expect(isIgnored(err("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isIgnored(err("Failed to fetch"))).toBe(true);
    // As Chromium's "Failed to fetch" reads once Sentry has added the host.
    expect(isIgnored(err("Failed to fetch (app.thedeensquadfootballacademy.co.uk)"))).toBe(true);
    expect(isIgnored(err("TypeError: Load failed (app.example)"))).toBe(true);
    expect(isIgnored(err("Failed to fetch the order"))).toBe(false);
    expect(isIgnored(err("Cannot read properties of undefined", "chrome-extension://abc/content.js"))).toBe(true);
  });

  it("keeps real failures, scrubbed", () => {
    const out = beforeSend(err(`relation "players" does not exist (for sana@example.com)`), { originalException: new Error("x") });
    expect(out?.exception?.values?.[0].value).toBe(`relation "players" does not exist (for [email])`);
    expect(beforeSend(err("Load failed"))).toBeNull();
  });
});

describe("scrubSpan", () => {
  it("scrubs a streamed span's name and drops queries, headers, cookies, IPs and personal details", () => {
    const out = scrubSpan({
      name: `GET /admin/families/${ID}`,
      attributes: {
        "url.full": `https://app.example/admin/families/${ID}?need=contract`,
        "url.query": "?need=contract",
        "http.query": "need=contract",
        "http.target": "/news?child=abc",
        "http.request.header.cookie": "ds_session=secret",
        "http.request.header.referer": "https://app.example/news?child=abc",
        "http.request.header.user_agent": "Mozilla/5.0",
        "client.address": "1.2.3.4",
        "user.id": ID,
        "user.email": "sana@example.com",
        "db.statement": "select * from guardians where email = 'sana@example.com'",
        "http.response.status_code": 200,
      },
    });
    expect(out.name).toBe("GET /admin/families/:id");
    expect(out.attributes).toEqual({
      "url.full": "https://app.example/admin/families/:id",
      "http.target": "/news",
      "http.request.header.user_agent": "Mozilla/5.0",
      "user.id": ID,
      "db.statement": "select * from guardians where email = '[email]'",
      "http.response.status_code": 200,
    });
  });

  it("never throws, so Sentry never falls back to sending the span as it was", () => {
    const span = { name: "x", attributes: null } as unknown as { name: string; attributes: object };
    expect(scrubSpan(span).attributes).toEqual({});
  });
});
