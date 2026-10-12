import { describe, expect, it } from "vitest";
import { PROGRESS_REPORT_SYSTEM, parseDraft, progressReportInput } from "./prompts";

describe("AI drafts", () => {
  it("reads a title and body, even wrapped in a code fence", () => {
    expect(parseDraft('```json\n{"title": "Pitch closed on Saturday", "body": "The council is **reseeding** it."}\n```', true)).toEqual({
      title: "Pitch closed on Saturday",
      body: "The council is reseeding it.",
    });
  });
  it("falls back to the whole reply as the body", () => {
    expect(parseDraft("Warm-up:\n- Rondos", true)).toEqual({ body: "Warm-up:\n- Rondos" });
    expect(parseDraft("## Warm-up:\n- Rondos", false)).toEqual({ body: "Warm-up:\n- Rondos" });
  });
});

describe("progress report drafts", () => {
  it("gives Claude only the app's facts, with the first name", () => {
    const input = progressReportInput({
      firstName: "Yusuf",
      month: "October 2026",
      ratings: ["Technique 3.8 of 5, up from 3.2"],
      ratingsCount: 4,
      sessions: 4,
      attended: 3,
      points: 7,
      stars: 1,
      badges: ["First goal"],
      notes: ["Great passing."],
      coachWords: null,
    });
    expect(input).toBe(
      [
        "Child's first name: Yusuf",
        "Month of the report: October 2026",
        "Coaches' ratings, average of the last 3 months (1 to 5), from 4 ratings:",
        "- Technique 3.8 of 5, up from 3.2",
        "Sessions this month: came to 3 of 4.",
        "Points this month: 7. Stars this month: 1.",
        "Badges earned this month: First goal.",
        "Coaches' notes this month:",
        "- Great passing.",
      ].join("\n"),
    );
    expect(PROGRESS_REPORT_SYSTEM).toMatch(/Never compare the child with other children/);
    expect(PROGRESS_REPORT_SYSTEM).toMatch(/80 to 140 words/);
    expect(PROGRESS_REPORT_SYSTEM).toMatch(/Never include children's surnames/);
  });
});
