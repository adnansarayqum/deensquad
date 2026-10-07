import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import type { CurrentUser } from "../auth/session";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";

// Card payments (SumUp) when a parent taps "Pay" again, and the SumUp webhook. SumUp is a fake fetch.
const holder: { t?: Awaited<ReturnType<typeof testDatabase>>; user?: CurrentUser } = {};

vi.mock("../db", () => ({
  asUser: <T>(id: string, fn: (tx: Queryable) => Promise<T>) => holder.t!.asUser(id, fn),
  asSystem: <T>(fn: (tx: Queryable) => Promise<T>) => holder.t!.asSystem(fn),
  isDemo: () => false,
}));
vi.mock("../auth/session", async (importActual) => ({
  ...(await importActual<typeof import("../auth/session")>()),
  requireParent: async () => holder.user!,
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.test" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));
const notified: string[] = [];
vi.mock("./notify", () => ({ notifyNewOrder: async (id: string) => void notified.push(id), notifyParentOrder: async () => {} }));
// Emails after the response: run straight away here, so the test can see them.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("../background", () => ({ enqueue: (_name: string, fn: () => Promise<unknown>) => fn() }));

const { payAgain } = await import("./actions");
const { confirmSumupPayment } = await import("./payments");
const { POST: webhook } = await import("@/app/api/sumup/webhook/route");

let t: Awaited<ReturnType<typeof testDatabase>>;
let order: string;

type Call = { url: string; method: string; signal?: AbortSignal | null };
let calls: Call[];

/** SumUp answers a checkout lookup with this status (for this order, £25.00), and makes new checkouts. */
function fakeSumup(status: string | "hang") {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", signal: init.signal });
      if (init.method === "POST") return Response.json({ id: "chk_new", hosted_checkout_url: "https://pay.sumup.example/chk_new" });
      if (status === "hang") return new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));
      return Response.json({ id: "chk_1", status, checkout_reference: order, amount: 25 });
    }),
  );
}

const form = () => {
  const f = new FormData();
  f.set("order", order);
  return f;
};
const row = async () =>
  (
    await t.asSystem((tx) =>
      tx.query<{ status: string; pay_by: string; sumup_checkout_id: string | null }>(`select status::text, pay_by, sumup_checkout_id from shop_orders where id = $1`, [order]),
    )
  )[0];
const posts = () => calls.filter((c) => c.method === "POST");

beforeAll(async () => {
  t = holder.t = await testDatabase({ seed: true });
  const adnan = await t.signIn(DEV_EMAILS.parent);
  holder.user = { id: adnan, email: DEV_EMAILS.parent, guardian: { id: DEV_IDS.adnan, firstName: "Adnan" }, staff: null };
});

beforeEach(async () => {
  vi.stubEnv("SUMUP_API_KEY", "test");
  vi.stubEnv("SUMUP_MERCHANT_CODE", "MTEST");
  vi.spyOn(console, "error").mockImplementation(() => {});
  notified.length = 0;
  await t.asSystem((tx) => tx.query(`delete from shop_orders`));
  [{ id: order }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `insert into shop_orders (guardian_id, status, pay_by, total_pence, sumup_checkout_id) values ($1, 'awaiting_payment', 'card', 2500, 'chk_1') returning id`,
      [DEV_IDS.adnan],
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Pay again on an order that already has a SumUp checkout", () => {
  it("PAID: confirms the payment and goes to the order, with no second checkout", async () => {
    fakeSumup("PAID");
    await expect(payAgain(form())).rejects.toThrow(`redirect /shop/orders/${order}?return=1`);
    expect(await row()).toEqual({ status: "paid", pay_by: "card", sumup_checkout_id: "chk_1" });
    expect(posts()).toEqual([]);
  });

  for (const status of ["PENDING", "FAILED"]) {
    it(`${status}: switches the order to bank transfer, still awaiting payment, with no second checkout`, async () => {
      fakeSumup(status);
      await expect(payAgain(form())).rejects.toThrow(`redirect /shop/orders/${order}?switched=bank`);
      expect(await row()).toEqual({ status: "awaiting_payment", pay_by: "bank", sumup_checkout_id: "chk_1" });
      expect(posts()).toEqual([]);
      expect(calls.map((c) => c.url)).toEqual(["https://api.sumup.com/v0.1/checkouts/chk_1"]);
      // The club is told about the bank order, as for any other.
      expect(notified).toEqual([order]);
    });
  }

  it("SumUp not answering within 10 seconds counts as not paid", async () => {
    const real = AbortSignal.timeout.bind(AbortSignal);
    const asked: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      asked.push(ms);
      return real(20); // shortened so the test doesn't wait ten seconds
    });
    fakeSumup("hang");
    await expect(payAgain(form())).rejects.toThrow(`redirect /shop/orders/${order}?switched=bank`);
    expect(asked).toEqual([10_000]);
    expect(await row()).toMatchObject({ status: "awaiting_payment", pay_by: "bank" });
    expect(posts()).toEqual([]);
  });

  it("the switched order can still be confirmed if the parent paid on that SumUp page after all", async () => {
    fakeSumup("PENDING");
    await expect(payAgain(form())).rejects.toThrow(/switched=bank/);
    fakeSumup("PAID");
    expect(await confirmSumupPayment("chk_1")).toBe(true);
    expect(await row()).toMatchObject({ status: "paid", pay_by: "card" });
  });
});

describe("Pay again on an order SumUp never gave a checkout", () => {
  it("makes one checkout, with a timeout, and sends the parent to it", async () => {
    await t.asSystem((tx) => tx.query(`update shop_orders set sumup_checkout_id = null where id = $1`, [order]));
    fakeSumup("PENDING");
    await expect(payAgain(form())).rejects.toThrow("redirect https://pay.sumup.example/chk_new");
    expect(posts()).toHaveLength(1);
    expect(posts()[0].signal).toBeInstanceOf(AbortSignal);
    expect(await row()).toEqual({ status: "awaiting_payment", pay_by: "card", sumup_checkout_id: "chk_new" });
  });

  it("switches to bank transfer when SumUp refuses (it may already hold that reference)", async () => {
    await t.asSystem((tx) => tx.query(`update shop_orders set sumup_checkout_id = null where id = $1`, [order]));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("duplicate checkout", { status: 409 })));
    await expect(payAgain(form())).rejects.toThrow(`redirect /shop/orders/${order}?switched=bank`);
    expect(await row()).toEqual({ status: "awaiting_payment", pay_by: "bank", sumup_checkout_id: null });
  });
});

describe("SumUp webhook", () => {
  const post = (body: unknown) => webhook(new Request("https://app.test/api/sumup/webhook", { method: "POST", body: JSON.stringify(body) }));

  it("doesn't call SumUp for a checkout no order is waiting on", async () => {
    fakeSumup("PAID");
    for (const id of ["chk_unknown", "chk_1"]) {
      if (id === "chk_1") await t.asSystem((tx) => tx.query(`update shop_orders set status = 'cancelled' where id = $1`, [order]));
      const res = await post({ id });
      expect(res.status).toBe(200);
    }
    expect(calls).toEqual([]);
  });

  it("asks SumUp about a checkout an order is waiting on, and marks it paid", async () => {
    fakeSumup("PAID");
    const res = await post({ id: "chk_1" });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(await row()).toMatchObject({ status: "paid" });
  });
});
