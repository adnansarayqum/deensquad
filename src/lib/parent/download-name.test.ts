import { describe, expect, it } from "vitest";
import { downloadName } from "./download-name";

describe("downloadName", () => {
  it("takes the file name from Content-Disposition", () => {
    expect(downloadName('attachment; filename="deen-squad-my-data-2026-10-07.json"')).toBe("deen-squad-my-data-2026-10-07.json");
  });

  it("falls back when there's none, or it holds a path", () => {
    expect(downloadName(null)).toBe("deen-squad-my-data.json");
    expect(downloadName("attachment")).toBe("deen-squad-my-data.json");
    expect(downloadName('attachment; filename="../x.json"')).toBe("deen-squad-my-data.json");
  });
});
