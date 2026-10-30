import { describe, expect, it } from "vitest";
import { isNoise, readReport } from "./client-errors";

describe("errors from people's phones", () => {
  it("keeps real faults and drops signal drops, browser quirks and extensions", () => {
    expect(isNoise("TypeError: Cannot read properties of undefined (reading 'height')")).toBe(false);
    expect(isNoise("TypeError: Failed to fetch")).toBe(true);
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isNoise("ChunkLoadError: Loading chunk 12 failed")).toBe(true);
    expect(isNoise("Error: boom", "chrome-extension://abc/content.js")).toBe(true);
  });

  it("carries only a short message and the path, no query", () => {
    expect(readReport({ message: "x".repeat(500), path: "/coach?group=U7#a", extra: "dropped" })).toEqual({ message: "x".repeat(300), path: "/coach" });
    expect(readReport({ message: "x", path: "https://evil.example" })).toBeNull();
    expect(readReport(null)).toBeNull();
  });
});
