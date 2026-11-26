import { describe, expect, it } from "vitest";
import { familyInitials, familyName } from "./family-name";

describe("a family's name for its chat", () => {
  it("shares a surname once", () => {
    expect(familyName(["Adnan Sample", "Sara Sample"], undefined)).toBe("Adnan and Sara Sample");
    expect(familyName(["Mohammed Uddin"], undefined)).toBe("Mohammed Uddin");
  });
  it("keeps different surnames whole", () => {
    expect(familyName(["Mohammed Uddin", "Aisha Khan"], undefined)).toBe("Mohammed Uddin and Aisha Khan");
    expect(familyName(["A One", "B Two", "C Three"], undefined)).toBe("A One, B Two and C Three");
  });
  it("falls back to the child", () => {
    expect(familyName([], { firstName: "Zaydan", lastName: "Uddin" })).toBe("Zaydan Uddin's family");
    expect(familyInitials([], { firstName: "Zaydan", lastName: "Uddin" })).toBe("ZU");
    expect(familyInitials(["Adnan Sample"], undefined)).toBe("AS");
  });
});
