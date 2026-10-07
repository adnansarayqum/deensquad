import { describe, expect, it } from "vitest";
import { GROUP_LABELS } from "./auth/registration";
import { AGE_GROUPS, defaultSessionGroups, groupPlural, groupsPlural, isAgeGroup, NUMBERED_GROUPS } from "./domain";

describe("the club's groups", () => {
  it("lists the age groups youngest first, then Girls", () => {
    expect(AGE_GROUPS).toEqual(["U6", "U7", "U10", "U12", "U15", "Girls"]);
    expect(NUMBERED_GROUPS).toEqual(["U6", "U7", "U10", "U12", "U15"]);
    expect(isAgeGroup("Girls")).toBe(true);
    expect(isAgeGroup("girls")).toBe(false);
    expect(isAgeGroup("U9")).toBe(false);
  });

  it("labels Girls for the sign-up picker and keeps the mixed U6", () => {
    expect(AGE_GROUPS.map((g) => GROUP_LABELS[g])).toEqual([
      "U6 (boys and girls)",
      "U7",
      "U10 (ages 8 to 10)",
      "U12 (ages 11 and 12)",
      "U15 (ages 13 to 15)",
      "Girls (all ages)",
    ]);
  });

  it("names a group's children without doubling the s", () => {
    expect(groupPlural("U10")).toBe("U10s");
    expect(groupPlural("Girls")).toBe("Girls");
    expect(groupsPlural(["U10", "U12"])).toBe("U10, U12s");
    expect(groupsPlural(["U12", "Girls"])).toBe("U12, Girls");
    expect(groupsPlural([])).toBe("");
  });

  it("opens Add sessions with the numbered groups ticked, not Girls, unless Girls is all a coach has", () => {
    expect(defaultSessionGroups([...AGE_GROUPS])).toEqual(["U6", "U7", "U10", "U12", "U15"]);
    expect(defaultSessionGroups(["U10", "Girls"])).toEqual(["U10"]);
    expect(defaultSessionGroups(["Girls"])).toEqual(["Girls"]);
  });
});
