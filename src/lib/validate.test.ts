import { describe, expect, it } from "vitest";
import { cleanPhone } from "./validate";

describe("cleanPhone", () => {
  it("keeps the existing UK and international formats", () => {
    expect(cleanPhone("07700900123")).toBe("07700 900123");
    expect(cleanPhone("07700 900 123")).toBe("07700 900123");
    expect(cleanPhone("+447700900123")).toBe("+447700900123");
    expect(cleanPhone("447700900123")).toBe("+447700900123");
  });

  it("puts back the 0 that Excel strips from a UK mobile", () => {
    expect(cleanPhone("7700900123")).toBe("07700 900123");
    expect(cleanPhone("7700 900123")).toBe("07700 900123");
  });

  it("rejects numbers that aren't a phone", () => {
    expect(cleanPhone("770090012")).toBeNull(); // 9 digits
    expect(cleanPhone("8700900123")).toBeNull(); // 10 digits, not a mobile
    expect(cleanPhone("")).toBeNull();
    expect(cleanPhone(undefined)).toBeNull();
  });
});
