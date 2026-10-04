import { describe, expect, it } from "vitest";
import { addLine, parseBasket } from "./basket";

const P = "11111111-1111-4111-8111-111111111111";
const K = "22222222-2222-4222-8222-222222222222";

describe("basket cookie", () => {
  it("ignores junk and clamps quantities", () => {
    expect(parseBasket("not json")).toEqual([]);
    expect(parseBasket(JSON.stringify({ product: P }))).toEqual([]);
    expect(parseBasket(JSON.stringify([{ product: "x" }, { product: P, player: "nope", quantity: 999, price: 1 }]))).toEqual([
      { product: P, player: null, size: null, initials: null, quantity: 20 },
    ]);
  });

  it("adds to an existing line instead of repeating it", () => {
    const line = { product: P, player: K, size: "S", initials: null, quantity: 1 };
    const basket = addLine(addLine([], line), { ...line, quantity: 2 });
    expect(basket).toEqual([{ ...line, quantity: 3 }]);
    expect(addLine(basket, { ...line, size: "M" })).toHaveLength(2);
  });
});
