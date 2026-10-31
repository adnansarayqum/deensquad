// Coaches type drills as "1. Dribble… 2. Pass…", sometimes on one line. Parents read them as a list of steps
// (UX review, Oct 2026: numbered instructions in one paragraph were hard to follow). Pure, so it's tested alone.

export type TextBlock = { kind: "para"; text: string } | { kind: "steps"; items: string[] };

const LINE_STEP = /^\s*(\d{1,2})[.)]\s+(.+)$/;
// "1. Do this 2. Then this": a number followed by ". " or ") " after a space, with at least two of them in the line.
const INLINE_STEP = /(?:^|\s)(\d{1,2})[.)]\s+/g;

/** Splits text into paragraphs and numbered step lists. Plain text with no numbering comes back as paragraphs. */
export function textBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let para: string[] = [];
  let steps: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join("\n") });
    para = [];
  };
  const flushSteps = () => {
    if (steps.length) blocks.push({ kind: "steps", items: steps });
    steps = [];
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const inline = splitInline(line);
    if (inline) {
      flushPara();
      if (inline.lead) {
        flushSteps();
        blocks.push({ kind: "para", text: inline.lead });
      }
      steps.push(...inline.items);
      continue;
    }
    const m = LINE_STEP.exec(line);
    if (m) {
      flushPara();
      steps.push(m[2].trim());
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushSteps();
      continue;
    }
    flushSteps();
    para.push(line);
  }
  flushPara();
  flushSteps();
  return blocks;
}

/** "Warm up: 1. Jog 2. Stretch" → lead "Warm up:" and the steps, when the line counts 1, 2, … in order. */
function splitInline(line: string): { lead: string; items: string[] } | null {
  const marks = [...line.matchAll(INLINE_STEP)];
  if (marks.length < 2) return null;
  if (!marks.every((m, i) => Number(m[1]) === i + 1)) return null;
  const items = marks.map((m, i) => line.slice(m.index! + m[0].length, marks[i + 1]?.index ?? line.length).trim()).filter(Boolean);
  if (items.length < 2) return null;
  return { lead: line.slice(0, marks[0].index).trim(), items };
}
