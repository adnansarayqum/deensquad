import { UUID } from "../auth/tokens";

// The basket lives in a cookie until checkout. It only holds choices; prices are looked up
// in the database when the order is placed (place_order), so editing the cookie changes nothing.

export const BASKET_COOKIE = "ds_basket";

export type BasketLine = { product: string; player: string | null; size: string | null; initials: string | null; quantity: number };

export function parseBasket(raw: string | undefined): BasketLine[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
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
  } catch {
    return [];
  }
}

/** Same item for the same child in the same size and initials: add to the quantity instead of a new line. */
export function addLine(basket: BasketLine[], line: BasketLine): BasketLine[] {
  const same = (l: BasketLine) => l.product === line.product && l.player === line.player && l.size === line.size && l.initials === line.initials;
  const existing = basket.find(same);
  if (existing) return basket.map((l) => (same(l) ? { ...l, quantity: Math.min(20, l.quantity + line.quantity) } : l));
  return [...basket, line].slice(0, 30);
}
