// Geometry for the ratings pentagon (src/components/charts/Pentagon.tsx). Pure, so it's tested without a browser.
// Five axes, the first straight up and the rest clockwise 72° apart. Scores run 1 to 5: a 1 sits on a small inner
// ring, not the centre, so a 1 is still a visible shape.

export const VIEW_W = 350;
export const VIEW_H = 220;
export const CENTRE = { x: VIEW_W / 2, y: 112 };
/** Radius of a 5. */
export const OUTER = 80;
/** Radius of a 1: a fifth of the way out. */
export const INNER = 16;

export type Point = { x: number; y: number };

const round = (n: number) => Math.round(n * 100) / 100;

/** The angle of axis `i` (0..4) in radians, 0 = straight up, clockwise. */
export function axisAngle(i: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / 5;
}

/** Distance from the centre for a score (clamped to 1..5). */
export function radiusFor(score: number): number {
  const s = Math.min(5, Math.max(1, score));
  return INNER + ((s - 1) / 4) * (OUTER - INNER);
}

export function pointAt(i: number, radius: number): Point {
  const a = axisAngle(i);
  return { x: round(CENTRE.x + radius * Math.cos(a)), y: round(CENTRE.y + radius * Math.sin(a)) };
}

/** The five vertices of a set of scores, in axis order. */
export function vertices(scores: readonly number[]): Point[] {
  return scores.map((s, i) => pointAt(i, radiusFor(s)));
}

export const toPoints = (ps: Point[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");

/** A gridline ring at a whole score. */
export function ring(score: number): Point[] {
  return [0, 1, 2, 3, 4].map((i) => pointAt(i, radiusFor(score)));
}

/**
 * Where axis `i`'s label goes: just outside the 5 ring, anchored away from the shape, with its lines stacked so they
 * grow outward (up for the top label, down for the bottom two).
 */
export function labelPlacement(i: number): { x: number; y: number; anchor: "start" | "middle" | "end"; grow: "up" | "down" | "centre" } {
  const p = pointAt(i, OUTER + 12);
  const cos = Math.cos(axisAngle(i));
  const sin = Math.sin(axisAngle(i));
  const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
  const grow = sin < -0.9 ? "up" : sin > 0.5 ? "down" : "centre";
  return { x: p.x, y: grow === "down" ? p.y + 4 : p.y, anchor: anchor === "middle" ? "middle" : anchor, grow };
}
