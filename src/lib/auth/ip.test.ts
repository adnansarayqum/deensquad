import { describe, expect, it } from "vitest";
import { clientIpFrom } from "./ip";

const from = (headers: Record<string, string>) => clientIpFrom(new Headers(headers));

describe("the visitor's internet address", () => {
  it("uses X-Real-IP, set by Railway's edge, before X-Forwarded-For", () => {
    expect(from({ "x-real-ip": " 203.0.113.7 ", "x-forwarded-for": "198.51.100.1, 203.0.113.9" })).toBe("203.0.113.7");
  });

  it("otherwise uses the rightmost X-Forwarded-For hop, ignoring a spoofed leftmost one", () => {
    expect(from({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })).toBe("203.0.113.9");
    expect(from({ "x-forwarded-for": "203.0.113.9" })).toBe("203.0.113.9");
  });

  it("caps the length and gives null when there is nothing usable", () => {
    expect(from({ "x-real-ip": "a".repeat(500) })).toHaveLength(64);
    expect(from({})).toBeNull();
    expect(from({ "x-real-ip": "  ", "x-forwarded-for": "1.1.1.1, " })).toBeNull();
  });
});
