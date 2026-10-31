import { describe, expect, it } from "vitest";
import { backTarget, sectionName, tabFor } from "./tabs";

describe("tabFor", () => {
  it("keeps the tab a page belongs to lit", () => {
    expect(tabFor("pass", null)).toBe("friday");
    expect(tabFor("messages", null)).toBe("player");
    expect(tabFor("news", null)).toBe("news");
  });

  it("keeps the tab a page was opened from", () => {
    expect(tabFor("player", "/checklist")).toBe("checklist");
    expect(tabFor("messages", "/news")).toBe("news");
  });

  it("ignores an unknown from", () => {
    expect(tabFor("player", "/admin")).toBe("player");
  });
});

describe("backTarget", () => {
  const fallback = { href: "/player", label: "Family" };

  it("goes back to the screen named in from", () => {
    expect(backTarget("/checklist", fallback)).toEqual({ href: "/checklist", label: "To-do" });
    expect(backTarget("/player/child/abc-123", fallback)).toEqual({ href: "/player/child/abc-123", label: "Child's details" });
    expect(backTarget("/player?child=abc", fallback)).toEqual({ href: "/player?child=abc", label: "Family" });
  });

  it("refuses anything that isn't a parent screen", () => {
    for (const from of ["https://evil.example", "//evil.example", "/admin", "/news/../admin", "/news\\evil", undefined, ["/news"]]) {
      expect(backTarget(from, fallback)).toEqual(fallback);
    }
  });

  it("names screens", () => {
    expect(sectionName("/friday")).toBe("Sessions");
    expect(sectionName("/news")).toBe("Home");
  });
});
