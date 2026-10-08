import { describe, expect, it } from "vitest";
import { isTrackedPath, normalisePath, normaliseUrl } from "./urls";

const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

describe("normaliseUrl", () => {
  it("keeps the origin and path and drops the query string and fragment", () => {
    expect(normaliseUrl("https://app.example/news?child=abc&from=%2Ffriday#top")).toBe("https://app.example/news");
    expect(normaliseUrl("https://app.example/admin/families?need=contract&q=Khan&group=U10")).toBe("https://app.example/admin/families");
  });

  it("replaces ids in the path with :id", () => {
    expect(normaliseUrl(`https://app.example/admin/families/${ID}?need=contract`)).toBe("https://app.example/admin/families/:id");
    expect(normaliseUrl(`https://app.example/files/${ID.toUpperCase()}?from=/friday`)).toBe("https://app.example/files/:id");
    expect(normaliseUrl("https://app.example/shop/orders/123456789")).toBe("https://app.example/shop/orders/:id");
    expect(normaliseUrl("https://app.example/x/0123456789abcdef0123")).toBe("https://app.example/x/:id");
    expect(normaliseUrl(`https://app.example/coach/plans/${ID}`)).toBe("https://app.example/coach/plans/:id");
  });

  it("never sends a sign-in token", () => {
    expect(normaliseUrl("https://app.example/sign-in/link?token=Zx9_Qw-12345678901234567890")).toBe("https://app.example/sign-in/link");
    expect(normaliseUrl("https://app.example/sign-in/Zx9_Qw-12345678901234567890")).toBe("https://app.example/sign-in/:id");
    expect(normaliseUrl("https://app.example/sign-in/abc")).toBe("https://app.example/sign-in/:id");
    // A family's calendar feed: the token is the key to it.
    expect(normaliseUrl(`https://app.example/api/calendar/${"ab12".repeat(16)}.ics`)).toBe("https://app.example/api/calendar/:id.ics");
    expect(normaliseUrl("https://app.example/sign-in/code")).toBe("https://app.example/sign-in/code");
    expect(normaliseUrl("https://app.example/sign-in/not-linked")).toBe("https://app.example/sign-in/not-linked");
    expect(normaliseUrl("https://app.example/sign-in?next=%2Fadmin%2Ffamilies%3Fneed%3Dcontract")).toBe("https://app.example/sign-in");
  });

  it("leaves ordinary screens alone", () => {
    for (const path of ["/", "/news", "/friday", "/checklist/agreement", "/admin/families/import", "/shop/basket", "/sign-up", "/privacy"]) {
      expect(normaliseUrl(`https://app.example${path}`)).toBe(`https://app.example${path}`);
    }
  });

  it("handles a relative address", () => {
    expect(normaliseUrl(`/files/${ID}?from=/friday`)).toBe("/files/:id");
    expect(normalisePath("/news?x=1")).toBe("/news");
  });
});

describe("isTrackedPath", () => {
  it("counts screens, not the API", () => {
    expect(isTrackedPath("/news")).toBe(true);
    expect(isTrackedPath("/api/files/x")).toBe(false);
    expect(isTrackedPath("/api")).toBe(false);
    expect(isTrackedPath("/apiary")).toBe(true);
  });
});
