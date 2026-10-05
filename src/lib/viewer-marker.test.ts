// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { markViewerOpened, takeViewerOpened } from "./viewer-marker";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("viewer opened-from-app marker", () => {
  it("matches only the viewer it was set for, once", () => {
    markViewerOpened("/files/a?from=%2Ffriday");
    expect(takeViewerOpened("/files/b?from=%2Ffriday")).toBe(false);
    markViewerOpened("/files/a?from=%2Ffriday");
    expect(takeViewerOpened("/files/a?from=%2Ffriday")).toBe(true);
    expect(takeViewerOpened("/files/a?from=%2Ffriday")).toBe(false);
  });

  it("is false when nothing set it (opened directly)", () => {
    expect(takeViewerOpened("/files/a")).toBe(false);
  });

  it("never throws when storage is unavailable (private browsing)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => markViewerOpened("/files/a")).not.toThrow();
    expect(takeViewerOpened("/files/a")).toBe(false);
  });
});
