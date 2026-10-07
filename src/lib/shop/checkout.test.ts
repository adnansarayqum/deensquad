import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import type { CurrentUser } from "../auth/session";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";
import { BASKET_COOKIE, parseBasket, parseBasketCookie, serialiseBasket, type BasketLine } from "./basket";

// Checkout when something in the basket can no longer be ordered: nothing is ordered, only the bad lines come out.
const holder: { t?: Awaited<ReturnType<typeof testDatabase>>; user?: CurrentUser; failPlaceOrder?: boolean } = {};
const jar = new Map<string, string>();

vi.mock("../db", () => ({
  asUser: <T>(id: string, fn: (tx: Queryable) => Promise<T>) =>
    holder.t!.asUser(id, (tx) =>
      fn(
        holder.failPlaceOrder
          ? {
              ...tx,
              query: (sql: string, params?: unknown[]) => {
                if (sql.includes("place_order")) throw new Error("connection lost");
                return tx.query(sql, params);
              },
            }
          : tx,
      ),
    ),
  asSystem: <T>(fn: (tx: Queryable) => Promise<T>) => holder.t!.asSystem(fn),
  isDemo: () => false,
}));
vi.mock("../auth/session", async (importActual) => ({
  ...(await importActual<typeof import("../auth/session")>()),
  requireParent: async () => holder.user!,
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));
vi.mock("./options", () => ({ paymentOptions: () => ["bank"] }));
vi.mock("./notify", () => ({ notifyNewOrder: async () => {}, notifyParentOrder: async () => {} }));
// The parent's confirmation email is queued for after the response; there's no request here.
vi.mock("next/server", () => ({ after: () => {} }));

const { checkout } = await import("./actions");

let t: Awaited<ReturnType<typeof testDatabase>>;
let shirt: string;
let socks: string;

const payByBank = () => {
  const f = new FormData();
  f.set("payBy", "bank");
  return f;
};
// An older cookie: a bare array with no attempt id.
const putBasket = (lines: BasketLine[]) => jar.set(BASKET_COOKIE, JSON.stringify(lines));
const putAttempt = (attempt: string, lines: BasketLine[]) => jar.set(BASKET_COOKIE, serialiseBasket({ attempt, lines }));
const basket = () => parseBasket(jar.get(BASKET_COOKIE));
const orders = async () => (await t.asSystem((tx) => tx.query(`select 1 from shop_orders where guardian_id = $1`, [DEV_IDS.adnan]))).length;
const ATTEMPT = "7d3c6a2e-1b4f-4c8e-9a0d-5f6e7a8b9c0d";
const line = (product: string, size: string | null): BasketLine => ({ product, player: DEV_IDS.yusuf, size, initials: null, quantity: 1 });

beforeAll(async () => {
  t = holder.t = await testDatabase({ seed: true });
  const adnan = await t.signIn(DEV_EMAILS.parent);
  holder.user = { id: adnan, email: DEV_EMAILS.parent, guardian: { id: DEV_IDS.adnan, firstName: "Adnan" }, staff: null };
});

beforeEach(async () => {
  jar.clear();
  holder.failPlaceOrder = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  await t.asSystem((tx) => tx.query(`delete from shop_orders`));
  [{ id: shirt }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(`insert into shop_products (name, price_pence, sizes) values ('Training top', 2000, '{S,M,L}') returning id`),
  );
  [{ id: socks }] = await t.asSystem((tx) => tx.query<{ id: string }>(`insert into shop_products (name, price_pence) values ('Match socks', 500) returning id`));
});

describe("checkout", () => {
  it("takes out an item that's no longer on sale, keeps the rest and orders nothing", async () => {
    putBasket([line(shirt, "M"), line(socks, null)]);
    await t.asSystem((tx) => tx.query(`update shop_products set active = false where id = $1`, [socks]));
    expect(await checkout({}, payByBank())).toEqual({
      error: "Match socks is no longer available, so we took it out. Check your basket and try again.",
    });
    expect(basket()).toEqual([line(shirt, "M")]);
    expect(await orders()).toBe(0);
  });

  it("takes out a line whose size is no longer offered", async () => {
    putBasket([line(shirt, "S"), line(shirt, "L"), line(socks, null)]);
    await t.asSystem((tx) => tx.query(`update shop_products set sizes = '{M,L}' where id = $1`, [shirt]));
    expect(await checkout({}, payByBank())).toEqual({
      error: "Training top (S) is no longer available, so we took it out. Check your basket and try again.",
    });
    expect(basket()).toEqual([line(shirt, "L"), line(socks, null)]);
    expect(await orders()).toBe(0);

    // What's left can then be ordered.
    await expect(checkout({}, payByBank())).rejects.toThrow(/^redirect \/shop\/orders\/[0-9a-f-]{36}\?placed=1$/);
    expect(basket()).toEqual([]);
    expect(await orders()).toBe(1);
  });

  it("names each size that's gone", async () => {
    putBasket([line(shirt, "S"), line(shirt, "L"), line(socks, null)]);
    await t.asSystem((tx) => tx.query(`update shop_products set sizes = '{M}' where id = $1`, [shirt]));
    expect(await checkout({}, payByBank())).toEqual({
      error: "Training top (S) and Training top (L) are no longer available, so we took them out. Check your basket and try again.",
    });
    expect(basket()).toEqual([line(socks, null)]);
  });

  it("keeps the whole basket when placing the order fails unexpectedly", async () => {
    putBasket([line(shirt, "M"), line(socks, null)]);
    holder.failPlaceOrder = true;
    expect(await checkout({}, payByBank())).toEqual({ error: "We couldn't place your order. Your basket is still here. Please try again." });
    expect(basket()).toEqual([line(shirt, "M"), line(socks, null)]);
    expect(await orders()).toBe(0);
  });

  it("places one order per basket attempt: the same checkout sent again lands on the order already placed", async () => {
    putAttempt(ATTEMPT, [line(shirt, "M"), line(socks, null)]);
    const first = await checkout({}, payByBank()).catch((e: Error) => e.message);
    expect(first).toMatch(/^redirect \/shop\/orders\/[0-9a-f-]{36}\?placed=1$/);
    expect(basket()).toEqual([]);
    expect(await orders()).toBe(1);

    // The phone sends the same request again (its cookie still holds the attempt): same order, nothing new.
    putAttempt(ATTEMPT, [line(shirt, "M"), line(socks, null)]);
    expect(await checkout({}, payByBank()).catch((e: Error) => e.message)).toBe(first);
    expect(basket()).toEqual([]);
    expect(await orders()).toBe(1);
    const [order] = await t.asSystem((tx) => tx.query<{ attempt_id: string; total_pence: number }>(`select attempt_id, total_pence from shop_orders`));
    expect(order).toEqual({ attempt_id: ATTEMPT, total_pence: 2500 });

    // A new basket is a new attempt and a new order.
    putAttempt("0e1d2c3b-4a59-4687-9a0b-1c2d3e4f5a6b", [line(socks, null)]);
    await expect(checkout({}, payByBank())).rejects.toThrow(/placed=1$/);
    expect(await orders()).toBe(2);
  });

  it("gives a basket its attempt id when the first line goes in and keeps it as lines change", async () => {
    const { addToBasket, removeFromBasket } = await import("./actions");
    const add = (product: string, size: string | null) => {
      const f = new FormData();
      f.set("product", product);
      f.set("player", DEV_IDS.yusuf);
      if (size) f.set("size", size);
      return f;
    };
    expect(await addToBasket({}, add(shirt, "M"))).toEqual({ added: true });
    const { attempt } = parseBasketCookie(jar.get(BASKET_COOKIE));
    expect(attempt).toMatch(/^[0-9a-f-]{36}$/);
    await addToBasket({}, add(socks, null));
    expect(parseBasketCookie(jar.get(BASKET_COOKIE))).toMatchObject({ attempt, lines: [line(shirt, "M"), line(socks, null)] });
    const remove = new FormData();
    remove.set("index", "0");
    await removeFromBasket(remove);
    expect(parseBasketCookie(jar.get(BASKET_COOKIE))).toMatchObject({ attempt, lines: [line(socks, null)] });
  });

  it("place_order itself returns the order already placed for an attempt", async () => {
    const items = JSON.stringify([{ product: socks, player: DEV_IDS.yusuf, quantity: 2 }]);
    const place = () => t.asUser(holder.user!.id, (tx) => tx.query<{ id: string }>(`select place_order($1::text::jsonb, 'bank', $2::uuid) as id`, [items, ATTEMPT]));
    const [[a], [b]] = await Promise.all([place(), place()]);
    expect(a.id).toBe(b.id);
    expect(await orders()).toBe(1);
    // Without an attempt (the previous version of the app), every call is a new order, as before.
    const [[c], [d]] = await Promise.all([
      t.asUser(holder.user!.id, (tx) => tx.query<{ id: string }>(`select place_order($1::text::jsonb, 'bank') as id`, [items])),
      t.asUser(holder.user!.id, (tx) => tx.query<{ id: string }>(`select place_order($1::text::jsonb, 'bank') as id`, [items])),
    ]);
    expect(c.id).not.toBe(d.id);
    expect(await orders()).toBe(3);
  });
});
