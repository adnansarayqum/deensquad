import { describe, expect, it } from "vitest";
import { chosenLabel, reachSentence, shortName, type NewsChild } from "./news-audience";

const child = (id: string, firstName: string, lastName: string, ageGroup: string, guardians: string[]): NewsChild => ({ id, firstName, lastName, ageGroup, guardians });
const list = [
  child("k", "Kaizan", "Ahmed", "U7", ["g1", "g2"]),
  child("m", "Musa", "bakr", "U7", ["g3"]),
  child("y", "Yusuf", "Sample", "U10", ["g3", "g4"]), // Musa's brother: g3 counts once
  child("o", "Omar", "", "U10", []),
];

describe("news audience words", () => {
  it("shortens names to the first name and last initial", () => {
    expect(shortName("Musa", "bakr")).toBe("Musa B.");
    expect(shortName("Omar", "")).toBe("Omar");
  });

  it("labels chosen children with at most two names", () => {
    expect(chosenLabel(["Kaizan A."])).toBe("1 child: Kaizan A.");
    expect(chosenLabel(["Kaizan A.", "Musa B."])).toBe("2 children: Kaizan A., Musa B.");
    expect(chosenLabel(["Kaizan A.", "Musa B.", "Ali C."])).toBe("3 children: Kaizan A., Musa B., +1");
  });

  it("says who a message will reach, counting each parent once", () => {
    expect(reachSentence({ kind: "all" }, list)).toBe("This goes to every family: 4 parents.");
    expect(reachSentence({ kind: "groups", groups: [] }, list)).toBe("Tick at least one group.");
    expect(reachSentence({ kind: "groups", groups: ["U7"] }, list)).toBe("This goes to 3 parents in U7.");
    expect(reachSentence({ kind: "groups", groups: ["U7", "U10"] }, list)).toBe("This goes to 4 parents in U7 and U10.");
    expect(reachSentence({ kind: "groups", groups: ["U12"] }, list)).toBe("No parents in U12 yet.");
    expect(reachSentence({ kind: "children", ids: new Set() }, list)).toBe("Choose at least one child.");
    expect(reachSentence({ kind: "children", ids: new Set(["k"]) }, list)).toBe("This goes to 2 parents of Kaizan A.");
    expect(reachSentence({ kind: "children", ids: new Set(["m"]) }, list)).toBe("This goes to 1 parent of Musa B.");
    expect(reachSentence({ kind: "children", ids: new Set(["m", "y"]) }, list)).toBe("This goes to 2 parents of Musa B. and Yusuf S.");
    expect(reachSentence({ kind: "children", ids: new Set(["k", "m", "y"]) }, list)).toBe("This goes to 4 parents of 3 children.");
    expect(reachSentence({ kind: "children", ids: new Set(["o"]) }, list)).toBe("Omar has no parents in the club's list yet.");
  });
});
