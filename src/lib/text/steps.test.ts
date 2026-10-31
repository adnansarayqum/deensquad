import { describe, expect, it } from "vitest";
import { textBlocks } from "./steps";

describe("textBlocks", () => {
  it("leaves plain text as paragraphs", () => {
    expect(textBlocks("Bring water.\n\nSee you Friday.")).toEqual([
      { kind: "para", text: "Bring water." },
      { kind: "para", text: "See you Friday." },
    ]);
  });
  it("turns numbered lines into steps", () => {
    expect(textBlocks("Cone weave\n1. Set out 5 cones\n2) Dribble through\n3. Back with the other foot")).toEqual([
      { kind: "para", text: "Cone weave" },
      { kind: "steps", items: ["Set out 5 cones", "Dribble through", "Back with the other foot"] },
    ]);
  });
  it("splits steps written on one line", () => {
    expect(textBlocks("Wall passes: 1. Pass with your right 10 times. 2. Then your left. 3. Then one touch.")).toEqual([
      { kind: "para", text: "Wall passes:" },
      { kind: "steps", items: ["Pass with your right 10 times.", "Then your left.", "Then one touch."] },
    ]);
  });
  it("keeps a lone number or a time in a sentence as text", () => {
    expect(textBlocks("Do it for 10 minutes. 2 sets is plenty.")).toEqual([{ kind: "para", text: "Do it for 10 minutes. 2 sets is plenty." }]);
    expect(textBlocks("Arrive 6.20 and 7. Bring water")).toEqual([{ kind: "para", text: "Arrive 6.20 and 7. Bring water" }]);
  });
});
