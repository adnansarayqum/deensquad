import { describe, expect, it } from "vitest";
import { AGE_GROUPS } from "../domain";
import { familiesFilter, familiesHref, familyChildHref } from "./families-link";

const id = "20000000-0000-4000-8000-000000000001";

describe("Families list filters carried to a child and back", () => {
  it("keeps group, need and q, and nothing else", () => {
    const filter = familiesFilter({ group: "U10", need: "contract", q: "  Yusuf ", invited: "3", next: "https://evil.example" }, AGE_GROUPS);
    expect(filter).toEqual({ group: "U10", need: "contract", q: "Yusuf" });
    expect(familyChildHref(id, filter)).toBe(`/admin/families/${id}?group=U10&need=contract&q=Yusuf`);
    expect(familiesHref(filter)).toBe("/admin/families?group=U10&need=contract&q=Yusuf");
  });

  it("drops values that aren't real filters", () => {
    expect(familiesFilter({ group: "U99", need: "toString", q: ["a", "b"] }, AGE_GROUPS)).toEqual({ group: null, need: null, q: "" });
    expect(familiesFilter({ group: "U7" }, ["U10"])).toEqual({ group: null, need: null, q: "" }); // not this coach's group
    expect(familiesHref(familiesFilter({}, AGE_GROUPS))).toBe("/admin/families");
    expect(familyChildHref(id, familiesFilter({}, AGE_GROUPS))).toBe(`/admin/families/${id}`);
  });

  it("can only ever link to the Families list", () => {
    const filter = familiesFilter({ q: "//evil.example/?x=1&need=payment#top" }, AGE_GROUPS);
    const href = familiesHref(filter);
    expect(href.startsWith("/admin/families?q=")).toBe(true);
    expect(new URL(href, "https://app.example").pathname).toBe("/admin/families");
    expect(new URL(href, "https://app.example").searchParams.get("need")).toBeNull();
    expect(familiesFilter({ q: "x".repeat(200) }, AGE_GROUPS).q).toHaveLength(60);
  });
});
