import { describe, expect, it } from "vitest";
import { cleanPhone } from "./validate";

describe("cleanPhone", () => {
  it("writes every UK number the same way, however it was typed", () => {
    expect(cleanPhone("07700900123")).toBe("07700 900123");
    expect(cleanPhone("07700 900 123")).toBe("07700 900123");
    expect(cleanPhone("+44 7700 900000")).toBe("07700 900000");
    expect(cleanPhone("+447700900123")).toBe("07700 900123");
    expect(cleanPhone("+44 (0)7700 900123")).toBe("07700 900123");
    expect(cleanPhone("447700900123")).toBe("07700 900123");
    expect(cleanPhone("0044 7700 900123")).toBe("07700 900123");
    expect(cleanPhone("(07700) 900123")).toBe("07700 900123");
  });

  it("keeps other countries' numbers with their code", () => {
    expect(cleanPhone("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(cleanPhone("+1 (415) 555-0100")).toBe("+14155550100");
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
