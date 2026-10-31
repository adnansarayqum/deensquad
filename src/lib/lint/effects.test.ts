import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// An effect written as `useEffect(() => something(), deps)` returns whatever `something()` returns. React calls that
// as the cleanup, so anything that isn't a function crashes the page the next time the effect runs. That's how the
// admins' assistant broke on 31 Oct 2026: newer Chrome returns a Promise from scrollIntoView. Effects use braces.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("effects", () => {
  it("never return the value of an expression (only a cleanup function or nothing)", () => {
    const bad = files("src").filter((f) => !f.endsWith("effects.test.ts")).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, i) => (/use(Layout|Insertion)?Effect\(\s*\(\)\s*=>\s*(?![{(\s]|\(\)\s*=>)/.test(line) && !/=>\s*\(\)\s*=>/.test(line) ? [`${f}:${i + 1}`] : [])),
    );
    expect(bad).toEqual([]);
  });
});
