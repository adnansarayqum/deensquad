import { describe, expect, it } from "vitest";
import { backPath, contentDisposition, pageCount, renderScale, viewerHref } from "./viewer";

describe("backPath", () => {
  it("keeps a screen inside the app", () => {
    expect(backPath("/friday", "/news")).toBe("/friday");
    expect(backPath("/coach/plans/abc?group=U10", "/coach")).toBe("/coach/plans/abc?group=U10");
  });

  it("falls back for anything that could leave the app or loop", () => {
    for (const from of [undefined, null, ["/friday"], "", "friday", "//evil.example", "/\\evil.example", "https://evil.example", "/ friday", "/files/x", "/api/files/x", `/${"a".repeat(300)}`]) {
      expect(backPath(from, "/news")).toBe("/news");
    }
  });
});

describe("viewerHref", () => {
  it("carries the screen it came from", () => {
    expect(viewerHref("f1", "/coach/plans/s1")).toBe("/files/f1?from=%2Fcoach%2Fplans%2Fs1");
    expect(viewerHref("f1")).toBe("/files/f1");
  });
});

describe("contentDisposition", () => {
  it("shows in place by default and saves when asked", () => {
    expect(contentDisposition("u10-plan.pdf", false)).toBe('inline; filename="u10-plan.pdf"');
    expect(contentDisposition("u10-plan.pdf", true)).toBe('attachment; filename="u10-plan.pdf"');
  });

  it("strips anything that could break the header", () => {
    expect(contentDisposition('a"b\r\nSet-Cookie: x.pdf', true)).toBe('attachment; filename="abSet-Cookie x.pdf"');
    expect(contentDisposition('"""', false)).toBe('inline; filename="attachment"');
  });
});

describe("pageCount", () => {
  it("says page or pages", () => {
    expect(pageCount(1)).toBe("1 page");
    expect(pageCount(3)).toBe("3 pages");
  });
});

describe("renderScale", () => {
  it("fills the width at the screen's pixel ratio, at most 2x", () => {
    expect(renderScale(595, 842, 390, 2)).toBeCloseTo(780 / 595);
    expect(renderScale(595, 842, 390, 3)).toBeCloseTo(780 / 595);
    expect(renderScale(595, 842, 390, 0)).toBeCloseTo(390 / 595);
  });

  it("stays under the canvas size phones allow", () => {
    const scale = renderScale(1000, 20000, 1000, 2);
    expect(1000 * scale * 20000 * scale).toBeLessThanOrEqual(12_000_001);
  });
});
