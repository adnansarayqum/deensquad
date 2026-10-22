import { describe, expect, it } from "vitest";
import { greetingName, staffNameForParents } from "./greeting";

describe("greeting staff by name", () => {
  it("skips the honorific the children use", () => {
    expect(greetingName("Uncle Tariq")).toBe("Tariq");
    expect(greetingName("Coach Sami")).toBe("Sami");
    expect(greetingName("coach hamza")).toBe("hamza");
    expect(greetingName("Mr. Ali Khan")).toBe("Ali");
    expect(greetingName("Sister Aisha")).toBe("Aisha");
    expect(greetingName("Aunty Fatima")).toBe("Fatima");
  });

  it("uses the first word otherwise, and keeps a name that is only an honorific", () => {
    expect(greetingName("Ibrahim Khan")).toBe("Ibrahim");
    expect(greetingName("  Hamza  ")).toBe("Hamza");
    expect(greetingName("Coach")).toBe("Coach");
    expect(greetingName("")).toBe("");
  });
});

describe("staffNameForParents", () => {
  it("keeps a title and first name, and shortens a full name to the first name", () => {
    expect(staffNameForParents("Coach Monju")).toBe("Coach Monju");
    expect(staffNameForParents("Uncle Tariq Ahmed")).toBe("Uncle Tariq");
    expect(staffNameForParents("Adnan Sarayqum")).toBe("Adnan");
    expect(staffNameForParents(null)).toBeNull();
  });
});
