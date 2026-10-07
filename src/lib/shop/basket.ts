import { UUID } from "../auth/tokens";

// The basket lives in a cookie until checkout. It only holds choices; prices are looked up
// in the database when the order is placed (place_order), so editing the cookie changes nothing.
// It also carries an attempt id, minted afresh every time the lines change: place_order gives one order per attempt,
// so a checkout sent twice (a phone whose signal dropped after the order was saved, a form resubmitted) lands on the
// same order, while a basket changed since then is a new attempt. Older cookies are a bare array with no attempt.

export const BASKET_COOKIE = "ds_basket";

export type BasketLine = { product: string; player: string | null; size: string | null; initials: string | null; quantity: number };

export type Basket = { attempt: string | null; lines: BasketLine[] };

export function parseBasketCookie(raw: string | undefined): Basket {
  if (!raw) return { attempt: null, lines: [] };
  try {
    const data = JSON.parse(raw) as unknown;
    if (Array.isArray(data)) return { attempt: null, lines: parseLines(data) };
    if (typeof data === "object" && data !== null && Array.isArray((data as { lines?: unknown }).lines)) {
      const attempt = (data as { attempt?: unknown }).attempt;
      return { attempt: typeof attempt === "string" && UUID.test(attempt) ? attempt : null, lines: parseLines((data as { lines: unknown[] }).lines) };
    }
    return { attempt: null, lines: [] };
  } catch {
    return { attempt: null, lines: [] };
  }
}

export function parseBasket(raw: string | undefined): BasketLine[] {
  return parseBasketCookie(raw).lines;
}

export function serialiseBasket(basket: Basket): string {
  return JSON.stringify({ attempt: basket.attempt, lines: basket.lines });
}

function parseLines(data: unknown[]): BasketLine[] {
  return data
    .filter((l): l is BasketLine => typeof l === "object" && l !== null && typeof (l as BasketLine).product === "string" && UUID.test((l as BasketLine).product))
    .map((l) => ({
      product: l.product,
      player: typeof l.player === "string" && UUID.test(l.player) ? l.player : null,
      size: typeof l.size === "string" ? l.size.slice(0, 30) : null,
      initials: typeof l.initials === "string" ? l.initials.slice(0, 3) : null,
      quantity: Math.min(20, Math.max(1, Math.trunc(Number(l.quantity) || 1))),
    }))
    .slice(0, 30);
}

/** Same item for the same child in the same size and initials: add to the quantity instead of a new line. */
export function addLine(basket: BasketLine[], line: BasketLine): BasketLine[] {
  const same = (l: BasketLine) => l.product === line.product && l.player === line.player && l.size === line.size && l.initials === line.initials;
  const existing = basket.find(same);
  if (existing) return basket.map((l) => (same(l) ? { ...l, quantity: Math.min(20, l.quantity + line.quantity) } : l));
  return [...basket, line].slice(0, 30);
}

/** True when an order's items are exactly these lines (same product, child, size, initials and quantity, any order). */
export function sameLines(a: readonly BasketLine[], b: readonly BasketLine[]): boolean {
  const key = (l: BasketLine) => [l.product, l.player ?? "", l.size ?? "", (l.initials ?? "").toUpperCase(), l.quantity].join("|");
  const sorted = (lines: readonly BasketLine[]) => lines.map(key).sort();
  const x = sorted(a);
  const y = sorted(b);
  return x.length === y.length && x.every((k, i) => k === y[i]);
}
