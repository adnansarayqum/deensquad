import { describe, expect, it } from "vitest";
import { AGE_GROUPS } from "../domain";
import { familiesFilter, familiesFilterFromForm, familiesHref, familyChildHref, withQuery } from "./families-link";

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

  it("reads the same filters back from a form's hidden fields (Send invite, Remove child), checked the same way", () => {
    const form = new FormData();
    form.set("child", id);
    form.set("group", "U10");
    form.set("need", "contract");
    form.set("q", " Yusuf ");
    form.set("next", "https://evil.example");
    const filter = familiesFilterFromForm(form, AGE_GROUPS);
    expect(filter).toEqual({ group: "U10", need: "contract", q: "Yusuf" });
    expect(withQuery(familyChildHref(id, filter), "invited=1")).toBe(`/admin/families/${id}?group=U10&need=contract&q=Yusuf&invited=1`);
    expect(withQuery(familiesHref(filter), "removed=1")).toBe("/admin/families?group=U10&need=contract&q=Yusuf&removed=1");
    // No filters: the plain pages, as before.
    const none = familiesFilterFromForm(new FormData(), AGE_GROUPS);
    expect(withQuery(familyChildHref(id, none), "invite=failed")).toBe(`/admin/families/${id}?invite=failed`);
    expect(withQuery(familiesHref(none), "removed=1")).toBe("/admin/families?removed=1");
    // A made-up group or need is dropped.
    const bad = new FormData();
    bad.set("group", "U99");
    bad.set("need", "__proto__");
    expect(familiesFilterFromForm(bad, AGE_GROUPS)).toEqual({ group: null, need: null, q: "" });
  });
});
