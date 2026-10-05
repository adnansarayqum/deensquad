import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import { DEV_IDS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";

const holder: { t?: Awaited<ReturnType<typeof testDatabase>> } = {};
vi.mock("../db", () => ({ asSystem: <T>(fn: (tx: Queryable) => Promise<T>) => holder.t!.asSystem(fn) }));

const { notifyNewOrder } = await import("./notify");

let t: Awaited<ReturnType<typeof testDatabase>>;
let order: string;
const notifiedAt = async () => (await t.asSystem((tx) => tx.query<{ at: string | null }>(`select notified_at::text as at from shop_orders where id = $1`, [order])))[0].at;

beforeEach(async () => {
  t = holder.t = await testDatabase({ seed: true });
  [{ id: order }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(`insert into shop_orders (guardian_id, status, pay_by, total_pence) values ($1, 'awaiting_payment', 'bank', 2500) returning id`, [DEV_IDS.adnan]),
  );
  vi.stubEnv("RESEND_API_KEY", "test");
  vi.stubEnv("SHOP_ORDERS_EMAIL", "shop@example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("new order email", () => {
  it("isn't marked as sent when the email fails, so the next try sends it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await notifyNewOrder(order);
    expect(await notifiedAt()).toBeNull();

    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await notifyNewOrder(order);
    expect(await notifiedAt()).not.toBeNull();
    await notifyNewOrder(order);
    expect(fetch).toHaveBeenCalledTimes(1); // once only
  });
});
