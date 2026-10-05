import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import type { CurrentUser } from "../auth/session";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";
import { BASKET_COOKIE, parseBasket, type BasketLine } from "./basket";

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
vi.mock("./notify", () => ({ notifyNewOrder: async () => {} }));

const { checkout } = await import("./actions");

let t: Awaited<ReturnType<typeof testDatabase>>;
let shirt: string;
let socks: string;

const payByBank = () => {
  const f = new FormData();
  f.set("payBy", "bank");
  return f;
};
const putBasket = (lines: BasketLine[]) => jar.set(BASKET_COOKIE, JSON.stringify(lines));
const basket = () => parseBasket(jar.get(BASKET_COOKIE));
const orders = async () => (await t.asSystem((tx) => tx.query(`select 1 from shop_orders where guardian_id = $1`, [DEV_IDS.adnan]))).length;
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
      error: "Training top is no longer available, so we took it out. Check your basket and try again.",
    });
    expect(basket()).toEqual([line(shirt, "L"), line(socks, null)]);
    expect(await orders()).toBe(0);

    // What's left can then be ordered.
    await expect(checkout({}, payByBank())).rejects.toThrow(/^redirect \/shop\/orders\/[0-9a-f-]{36}\?placed=1$/);
    expect(basket()).toEqual([]);
    expect(await orders()).toBe(1);
  });

  it("keeps the whole basket when placing the order fails unexpectedly", async () => {
    putBasket([line(shirt, "M"), line(socks, null)]);
    holder.failPlaceOrder = true;
    expect(await checkout({}, payByBank())).toEqual({ error: "We couldn't place your order. Your basket is still here. Please try again." });
    expect(basket()).toEqual([line(shirt, "M"), line(socks, null)]);
    expect(await orders()).toBe(0);
  });
});
