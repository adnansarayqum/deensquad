// Design-system guards (27 Nov 2026 UI review): every screen uses the shared scales, so the app keeps looking like
// one app. Each reads the source of src/app and src/components; a screen that drifts off a scale fails here with the
// file and the class. The scales live in design/tokens.json (type, colour, radius) and src/components/ui.tsx (icons).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const files = ["src/app", "src/components"]
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  // Images drawn on the server (the player-of-the-week card) use inline styles, not the app's classes.
  .filter((f) => !/\/api\/spotlight\//.test(f));
const sources = files.map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, "utf8") }));

/** Charts draw data: their bars, lines and dots keep their own strokes and corners. */
const isChart = (file: string) => /charts|admin\/app-use\/page/.test(file);

/** Every `pattern` match in the sources, as "file: match". */
function find(pattern: RegExp, keep: (match: string) => boolean = () => true): string[] {
  return sources.flatMap(({ file, text }) => [...text.matchAll(pattern)].map((m) => m[0]).filter(keep).map((m) => `${file}: ${m}`));
}

describe("type scale", () => {
  it("text sizes come from the tokens (title, heading, subhead, body, small, meta)", () => {
    // Arbitrary sizes are kept for display figures only: Bebas numbers and headlines at 22px and up.
    const offScale = find(/(?<![\w-])text-\[(\d+)px\]/g, (m) => Number(/\d+/.exec(m)![0]) < 22);
    expect(offScale).toEqual([]);
  });

  it("Tailwind's own sizes aren't used beside the app's scale", () => {
    expect(find(/(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g)).toEqual([]);
  });
});

describe("icons", () => {
  it("icons are 16, 20, 24 or 32px (ICON in ui.tsx), or 40px and up for a picture", () => {
    const allowed = new Set([16, 20, 24, 32]);
    const wrong = sources.flatMap(({ file, text }) => {
      const names = new Set<string>(["Icon"]);
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
        for (const part of m[1].split(",")) {
          const name = part.trim().split(/\s+as\s+/).pop();
          if (name && !name.startsWith("type ")) names.add(name);
        }
      }
      if (names.size === 1 && !text.includes("badgeIcons")) return [];
      const tag = new RegExp(`<(?:${[...names].join("|")})\\b[^<>]*?size=\\{(\\d+)\\}`, "gs");
      return [...text.matchAll(tag)].map((m) => Number(m[1])).filter((n) => !allowed.has(n) && n < 40).map((n) => `${file}: size ${n}`);
    });
    expect(wrong).toEqual([]);
  });

  it("strokes are 2, 2.5 for the lit tab or 3 for ticks (0 for a filled star)", () => {
    expect(find(/strokeWidth=\{(\d+(\.\d+)?)\}/g, (m) => !/\{(0|2|2\.5|3)\}/.test(m)).filter((m) => !isChart(m))).toEqual([]);
  });
});

describe("colour", () => {
  it("colours come from tokens, never Tailwind's palette", () => {
    expect(find(/(?<![\w-])(bg|text|border|ring|fill|stroke|from|to|via|outline|decoration)-(gray|slate|zinc|neutral|stone|red|green|blue|amber|yellow|emerald|lime|teal|sky|indigo|violet|purple|pink|rose)-\d{2,3}\b/g)).toEqual([]);
  });

  it("green text is grass-text: pitch is a surface and fails contrast as text in dark mode", () => {
    expect(find(/(?<![\w-])text-pitch(?![\w-])/g)).toEqual([]);
  });
});

describe("shapes and components", () => {
  it("corners use the radius tokens (rounded-dash, -web, -app, -pill)", () => {
    // Chat bubbles keep their rounder corners and smaller tail corner on purpose; chart bars their own.
    const wrong = find(/(?<![\w-])rounded(-[trblse]{1,2})?-(sm|md|lg|xl|2xl|3xl|full|\[\d+px\])(?![\w-])/g, (m) => !/\[(22|24)px\]/.test(m))
      .filter((m) => !isChart(m) && !/messages\/Chat\.tsx: rounded-b[lr]-md/.test(m));
    expect(wrong).toEqual([]);
  });

  it("tick boxes and radios use the .check style, not their own size and accent", () => {
    expect(find(/accent-\[var\(--[\w-]+\)\]/g)).toEqual([]);
  });

  it("parent and sign-in screens share the .app-column width", () => {
    expect(find(/max-w-\[430px\]/g)).toEqual([]);
  });

  it("no control hides the keyboard focus ring", () => {
    // tabIndex={-1} targets (a heading or notice that focus is moved to) may drop the outline; controls may not.
    const hidden = sources.flatMap(({ file, text }) =>
      [...text.matchAll(/<(input|textarea|select|button|a|Link|summary)\b[^>]*?(focus(-visible)?:outline-none|outline-none)[^>]*>/g)].map((m) => `${file}: <${m[1]}>`),
    );
    expect(hidden).toEqual([]);
  });
});
