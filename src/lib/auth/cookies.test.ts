import { describe, expect, it } from "vitest";
import { safeNext } from "./cookies";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/friday")).toBe("/friday");
    expect(safeNext("/admin/families?group=U10&q=Ali%20B")).toBe("/admin/families?group=U10&q=Ali%20B");
  });

  it("refuses anything a browser could read as another website", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/ /x", null, 1]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
