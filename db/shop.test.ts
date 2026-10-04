// The club shop's rules, checked as different signed-in people on a real Postgres (PGlite).
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { loadMyOrders, loadSupplierTotals } from "@/lib/shop/data";
import { testDatabase } from "../test/db";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string;
let sara: string;
let other: string;
let coach: string;
let hoodie: string; // £15, sizes, initials £5
let socks: string; // £7, Junior/Adult, no initials
let otherChild: string;

const place = (user: string, items: unknown[], payBy = "card") =>
  t.asUser(user, (tx) => tx.query<{ id: string }>(`select place_order($1::jsonb, $2) as id`, [JSON.stringify(items), payBy]));

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  other = await t.signIn("parent1@example.com");
  coach = await t.signIn(DEV_EMAILS.coach);
  [{ id: hoodie }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from shop_products where name = 'Hoodie'`));
  [{ id: socks }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from shop_products where name = 'Socks'`));
  [{ id: otherChild }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `select p.id from players p join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id where g.email = 'parent1@example.com'`,
    ),
  );
});

describe("placing an order", () => {
  it("prices the order from the products table, not the basket", async () => {
    const [{ id }] = await place(adnan, [
      { product: hoodie, player: DEV_IDS.yusuf, size: "9-10", initials: "yk", quantity: 2, price: 1 },
      { product: socks, player: DEV_IDS.musa, size: "Junior", quantity: 1, unit_pence: 0 },
    ]);
    const [order] = await t.asSystem((tx) =>
      tx.query<{ total_pence: number; status: string }>(`select total_pence, status::text from shop_orders where id = $1`, [id]),
    );
    expect(order).toEqual({ total_pence: 2 * (1500 + 500) + 700, status: "awaiting_payment" });
    const items = await t.asSystem((tx) => tx.query<{ initials: string | null }>(`select initials from shop_order_items where order_id = $1 order by unit_pence desc`, [id]));
    expect(items.map((i) => i.initials)).toEqual(["YK", null]);
  });

  it("refuses sizes, initials and quantities the item doesn't offer", async () => {
    await expect(place(adnan, [{ product: hoodie, size: "XXXL", quantity: 1 }])).rejects.toThrow(/invalid size/);
    await expect(place(adnan, [{ product: hoodie, quantity: 1 }])).rejects.toThrow(/invalid size/);
    await expect(place(adnan, [{ product: socks, size: "Adult", initials: "AB", quantity: 1 }])).rejects.toThrow(/invalid initials/);
    await expect(place(adnan, [{ product: hoodie, size: "S", initials: "ABCD", quantity: 1 }])).rejects.toThrow(/invalid initials/);
    await expect(place(adnan, [{ product: hoodie, size: "S", quantity: 50 }])).rejects.toThrow(/invalid quantity/);
    await expect(place(adnan, [])).rejects.toThrow(/invalid basket/);
    await expect(place(adnan, [{ product: socks, size: "Adult", quantity: 1 }], "cash")).rejects.toThrow(/invalid payment method/);
  });

  it("refuses hidden items and other families' children", async () => {
    await t.asSystem((tx) => tx.query(`update shop_products set active = false where id = $1`, [socks]));
    await expect(place(adnan, [{ product: socks, size: "Adult", quantity: 1 }])).rejects.toThrow(/not available/);
    await t.asSystem((tx) => tx.query(`update shop_products set active = true where id = $1`, [socks]));
    await expect(place(adnan, [{ product: socks, player: otherChild, size: "Adult", quantity: 1 }])).rejects.toThrow(/not allowed/);
  });

  it("only takes orders from parents", async () => {
    await expect(place(coach, [{ product: socks, size: "Adult", quantity: 1 }])).rejects.toThrow(/not allowed/);
  });

  it("doesn't let parents write orders directly", async () => {
    await expect(
      t.asUser(adnan, (tx) => tx.query(`insert into shop_orders (guardian_id, status, total_pence) values (my_guardian_id(), 'paid', 0)`)),
    ).rejects.toThrow();
    await expect(t.asUser(adnan, (tx) => tx.query(`update shop_products set price_pence = 1`))).resolves.toBeDefined();
    const [{ price_pence }] = await t.asSystem((tx) => tx.query<{ price_pence: number }>(`select price_pence from shop_products where id = $1`, [hoodie]));
    expect(price_pence).toBe(1500);
  });
});

describe("reading orders", () => {
  it("shows a family its own orders only", async () => {
    await place(other, [{ product: socks, player: otherChild, size: "Junior", quantity: 1 }], "bank");
    const mine = await t.asUser(adnan, loadMyOrders);
    const saras = await t.asUser(sara, loadMyOrders);
    const others = await t.asUser(other, loadMyOrders);
    expect(mine.length).toBeGreaterThan(0);
    expect(others).toHaveLength(1);
    expect(others[0].payBy).toBe("bank");
    expect(others[0].reference).toMatch(/^DS-[0-9A-F]{6}$/);
    // Orders belong to the parent who placed them.
    expect(saras).toHaveLength(0);
    const peek = await t.asUser(adnan, (tx) => tx.query(`select 1 from shop_order_items where player_id = $1`, [otherChild]));
    expect(peek).toHaveLength(0);
  });

  it("gives staff the supplier totals for paid orders only", async () => {
    expect(await t.asUser(coach, loadSupplierTotals)).toEqual([]);
    const [order] = await t.asUser(other, loadMyOrders);
    // The transfer arrives and the club marks it paid; parents can't do that themselves.
    await t.asUser(other, (tx) => tx.query(`update shop_orders set status = 'paid' where id = $1`, [order.id]));
    expect(await t.asUser(coach, loadSupplierTotals)).toEqual([]);
    await t.asUser(coach, (tx) => tx.query(`update shop_orders set status = 'paid' where id = $1`, [order.id]));
    expect(await t.asUser(coach, loadSupplierTotals)).toEqual([{ productName: "Socks", size: "Junior", quantity: 1, initials: 0 }]);
  });

  it("flags a child on the register when their kit is ready", async () => {
    const [order] = await t.asUser(other, loadMyOrders);
    await t.asUser(coach, (tx) => tx.query(`update shop_orders set status = 'ready' where id = $1`, [order.id]));
    const [{ ready }] = await t.asSystem((tx) =>
      tx.query<{ ready: boolean }>(
        `select exists (select 1 from shop_order_items i join shop_orders o on o.id = i.order_id where i.player_id = $1 and o.status = 'ready') as ready`,
        [otherChild],
      ),
    );
    expect(ready).toBe(true);
  });
});

describe("points and stars", () => {
  it("lets staff give awards and families read only their own children's", async () => {
    await t.asUser(coach, (tx) => tx.query(`insert into player_awards (player_id, points, reason) values ($1, 3, 'Good effort')`, [otherChild]));
    const mine = await t.asUser(adnan, (tx) => tx.query<{ player_id: string }>(`select player_id from player_awards`));
    expect(mine.every((a) => a.player_id === DEV_IDS.yusuf || a.player_id === DEV_IDS.musa)).toBe(true);
    const theirs = await t.asUser(other, (tx) => tx.query<{ points: number }>(`select points from player_awards`));
    expect(theirs).toEqual([{ points: 3 }]);
    await expect(t.asUser(adnan, (tx) => tx.query(`insert into player_awards (player_id, stars) values ($1, 1)`, [DEV_IDS.yusuf]))).rejects.toThrow();
  });
});
