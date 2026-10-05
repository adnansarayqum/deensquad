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
let socks: string; // £7, one size, no initials
let otherChild: string;

const place = (user: string, items: unknown[], payBy = "card") =>
  t.asUser(user, (tx) => tx.query<{ id: string }>(`select place_order($1::jsonb, $2) as id`, [JSON.stringify(items), payBy]));

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  other = await t.signIn("parent1@example.com");
  coach = await t.signIn(DEV_EMAILS.coach);
  [{ id: hoodie }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from shop_products where name = 'Deen Squad full zip hoodie'`));
  [{ id: socks }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from shop_products where name = 'Black football socks'`));
  [{ id: otherChild }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `select p.id from players p join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id where g.email = 'parent1@example.com'`,
    ),
  );
});

describe("placing an order", () => {
  it("prices the order from the products table, not the basket", async () => {
    const [{ id }] = await place(adnan, [
      { product: hoodie, player: DEV_IDS.yusuf, size: "Youth M (69-75cm chest)", initials: "yk", quantity: 2, price: 1 },
      { product: socks, player: DEV_IDS.musa, quantity: 1, unit_pence: 0 },
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
    await expect(place(adnan, [{ product: socks, initials: "AB", quantity: 1 }])).rejects.toThrow(/invalid initials/);
    await expect(place(adnan, [{ product: hoodie, size: "Adult S", initials: "ABCD", quantity: 1 }])).rejects.toThrow(/invalid initials/);
    await expect(place(adnan, [{ product: hoodie, size: "Adult S", quantity: 50 }])).rejects.toThrow(/invalid quantity/);
    await expect(place(adnan, [])).rejects.toThrow(/invalid basket/);
    await expect(place(adnan, [{ product: socks, quantity: 1 }], "cash")).rejects.toThrow(/invalid payment method/);
  });

  it("refuses hidden items and other families' children", async () => {
    await t.asSystem((tx) => tx.query(`update shop_products set active = false where id = $1`, [socks]));
    await expect(place(adnan, [{ product: socks, quantity: 1 }])).rejects.toThrow(/not available/);
    await t.asSystem((tx) => tx.query(`update shop_products set active = true where id = $1`, [socks]));
    await expect(place(adnan, [{ product: socks, player: otherChild, quantity: 1 }])).rejects.toThrow(/not allowed/);
  });

  it("only takes orders from parents", async () => {
    await expect(place(coach, [{ product: socks, quantity: 1 }])).rejects.toThrow(/not allowed/);
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
    await place(other, [{ product: socks, player: otherChild, quantity: 1 }], "bank");
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
    expect(await t.asUser(coach, loadSupplierTotals)).toEqual([{ productName: "Black football socks", size: null, quantity: 1, initials: 0 }]);
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

describe("club contract", () => {
  it("lets a parent sign for their own child only, once per season", async () => {
    const sign = (user: string, player: string) =>
      t.asUser(user, (tx) => tx.query(`select sign_agreement($1, 'contract-test', 'Adnan Sample', 'Yusuf Sample')`, [player]));
    await sign(adnan, DEV_IDS.yusuf);
    await sign(sara, DEV_IDS.yusuf); // the other parent: already signed, nothing changes
    await expect(sign(adnan, otherChild)).rejects.toThrow(/not allowed/);
    const rows = await t.asUser(coach, (tx) => tx.query<{ parent_name: string }>(`select parent_name from agreements where document = 'contract-test'`));
    expect(rows).toEqual([{ parent_name: "Adnan Sample" }]);
    await expect(
      t.asUser(adnan, (tx) => tx.query(`insert into agreements (player_id, document, parent_name, player_name) values ($1, 'x', 'a', 'b')`, [DEV_IDS.musa])),
    ).rejects.toThrow();
  });
});

describe("session plans and practice sheets", () => {
  it("shows a plan and its file to the group's families only", async () => {
    const [session] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`select id from sessions where 'U10' = any (age_groups) and starts_at > now() order by starts_at limit 1`),
    );
    const [{ id: fileId }] = await t.asUser(coach, (tx) =>
      tx.query<{ id: string }>(`insert into club_files (name, mime, size, data) values ('plan.pdf', 'application/pdf', 4, $1) returning id`, [
        new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      ]),
    );
    await t.asUser(coach, (tx) =>
      tx.query(`insert into session_plans (session_id, age_group, body, file_id) values ($1, 'U10', 'Rondos', $2)`, [session.id, fileId]),
    );
    // Adnan has a U10 child; parent1 (U10 too in the seed) can see it; a family without U10 can't.
    const seen = await t.asUser(adnan, (tx) => tx.query<{ body: string }>(`select body from session_plans`));
    expect(seen).toEqual([{ body: "Rondos" }]);
    const file = await t.asUser(adnan, (tx) => tx.query<{ size: number }>(`select size from club_files where id = $1`, [fileId]));
    expect(file).toEqual([{ size: 4 }]);

    const [hana] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`insert into guardians (first_name, last_name, email) values ('Hana', 'R', 'hana@example.com') returning id`),
    );
    const [kid] = await t.asSystem((tx) => tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group) values ('Ali', 'R', 'U15') returning id`));
    await t.asSystem((tx) => tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [kid.id, hana.id]));
    const outsider = await t.signIn("hana@example.com");
    expect(await t.asUser(outsider, (tx) => tx.query(`select 1 from session_plans`))).toHaveLength(0);
    expect(await t.asUser(outsider, (tx) => tx.query(`select 1 from club_files where id = $1`, [fileId]))).toHaveLength(0);

    await t.asUser(coach, (tx) => tx.query(`insert into practice_sheets (title, age_groups) values ('U15 drills', '{U15}'), ('For everyone', '{}')`));
    const sheets = await t.asUser(outsider, (tx) => tx.query<{ title: string }>(`select title from practice_sheets order by title`));
    expect(sheets.map((s) => s.title)).toEqual(["For everyone", "U15 drills"]);
    await expect(t.asUser(outsider, (tx) => tx.query(`insert into practice_sheets (title) values ('x')`))).rejects.toThrow();
  });
});

describe("plan notifications", () => {
  it("tells each group's parents once, and waits overnight", async () => {
    const { notifyPending } = await import("@/lib/plans/notify");
    const sent: { users: string[]; title: string }[] = [];
    const push = async (_tx: unknown, users: string[], p: { title: string }) => void sent.push({ users, title: p.title });
    const night = new Date(Date.now());
    night.setUTCHours(23, 30); // 23:30 or 00:30 London: quiet
    expect(await t.asSystem((tx) => notifyPending(tx, night, push))).toEqual({ plans: 0, sheets: 0 });
    const day = new Date(Date.now());
    day.setUTCHours(10, 0);
    const first = await t.asSystem((tx) => notifyPending(tx, day, push));
    expect(first.plans + first.sheets).toBeGreaterThan(0);
    const u10 = sent.find((s) => s.title.startsWith("U10 session plan"));
    expect(u10?.users).toContain(adnan);
    const [hana] = await t.asSystem((tx) => tx.query<{ id: string }>(`select auth_user_id as id from guardians where email = 'hana@example.com'`));
    expect(u10?.users).not.toContain(hana.id); // a U15 family
    expect(await t.asSystem((tx) => notifyPending(tx, day, push))).toEqual({ plans: 0, sheets: 0 });
  });
});
