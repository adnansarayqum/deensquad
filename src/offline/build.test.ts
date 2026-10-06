import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOffline, OFFLINE_OUT } from "../../scripts/build-offline.mjs";

describe("the offline attendance QR page", () => {
  it("has its script built from the current source (run `npm run offline` and bump VERSION in public/sw.js)", async () => {
    expect(readFileSync(OFFLINE_OUT, "utf8")).toBe(await buildOffline());
  });

  it("holds no one's data and loads only its own script", () => {
    const html = readFileSync(new URL("../../public/offline-pass.html", import.meta.url), "utf8");
    expect(html).not.toMatch(/DSP\./);
    expect([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1])).toEqual(["/offline-pass.js"]);
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>/);
  });
});
