import { describe, expect, it } from "vitest";
import { AGE_GROUPS, type AgeGroup } from "../domain";
import { overlaps, within } from "./scope";

const u7: AgeGroup[] = ["U7"];
const all: AgeGroup[] = [...AGE_GROUPS];

describe("within (may a group coach change it?)", () => {
  it("is false for a message to every family, null or empty", () => {
    expect(within(null, u7)).toBe(false);
    expect(within([], u7)).toBe(false);
    expect(within(null, all)).toBe(false);
  });

  it("needs every group the target covers to be the coach's", () => {
    expect(within(["U7"], u7)).toBe(true);
    expect(within(["U10"], u7)).toBe(false);
    expect(within(["U7", "U10"], u7)).toBe(false);
    expect(within(["U10", "U12", "U15"], ["U10", "U12"])).toBe(false);
    expect(within(["U10", "U12"], ["U10", "U12", "U15"])).toBe(true);
  });

  it("covers any set of groups for someone with every group (an admin, or a coach with none ticked)", () => {
    expect(within(["U6", "U7", "U10", "U12", "U15"], all)).toBe(true);
    expect(within(["U10"], all)).toBe(true);
  });

  it("ignores old age groups the club no longer offers", () => {
    expect(within(["U9"], all)).toBe(false);
  });
});

describe("overlaps (may a group coach see it?)", () => {
  it("is true for a message to every family, null or empty", () => {
    expect(overlaps(null, u7)).toBe(true);
    expect(overlaps([], u7)).toBe(true);
  });

  it("is true when at least one group is the coach's", () => {
    expect(overlaps(["U7"], u7)).toBe(true);
    expect(overlaps(["U7", "U10"], u7)).toBe(true);
    expect(overlaps(["U10"], u7)).toBe(false);
    expect(overlaps(["U10", "U12", "U15"], u7)).toBe(false);
  });

  it("is true for everything when someone has every group", () => {
    for (const g of AGE_GROUPS) expect(overlaps([g], all)).toBe(true);
  });
});
