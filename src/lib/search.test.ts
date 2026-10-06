import { describe, expect, it } from "vitest";
import { matchesName } from "./search";

describe("finding a child by name", () => {
  it("matches the start of the first name or the last initial, ignoring case and accents", () => {
    expect(matchesName("mus", "Musa", "S")).toBe(true);
    expect(matchesName("MUSA", "Musa", "S")).toBe(true);
    expect(matchesName("usa", "Musa", "S")).toBe(false);
    expect(matchesName("s", "Musa", "S")).toBe(true);
    expect(matchesName("musa s.", "Musa", "S")).toBe(true);
    expect(matchesName("musa k", "Musa", "S")).toBe(false);
    expect(matchesName("zoe", "Zoë", "K")).toBe(true);
  });

  it("matches everyone when nothing is typed, and works with full last names", () => {
    expect(matchesName("", "Musa", "S")).toBe(true);
    expect(matchesName("  ", "Musa", "S")).toBe(true);
    expect(matchesName("kh", "Ali", "Khan")).toBe(true);
    expect(matchesName("ali kh", "Ali", "Khan")).toBe(true);
  });
});
