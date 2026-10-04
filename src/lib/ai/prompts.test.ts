import { describe, expect, it } from "vitest";
import { parseDraft } from "./prompts";

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
