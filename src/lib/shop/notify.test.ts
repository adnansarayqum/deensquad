import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import { DEV_IDS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";

const holder: { t?: Awaited<ReturnType<typeof testDatabase>> } = {};
vi.mock("../db", () => ({ asSystem: <T>(fn: (tx: Queryable) => Promise<T>) => holder.t!.asSystem(fn) }));

const { notifyNewOrder, notifyParentOrder } = await import("./notify");

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

describe("emails to the parent about their order", () => {
  const column = async (name: string) =>
    (await t.asSystem((tx) => tx.query<{ at: string | null }>(`select ${name}::text as at from shop_orders where id = $1`, [order])))[0].at;
  const sentTo = (fetch: ReturnType<typeof vi.fn>) =>
    fetch.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)) as { to: string[]; subject: string; text: string });
  const ok = () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  };

  beforeEach(async () => {
    vi.stubEnv("BANK_ACCOUNT_NAME", "Deen Squad FA");
    vi.stubEnv("BANK_SORT_CODE", "12-34-56");
    vi.stubEnv("BANK_ACCOUNT_NUMBER", "12345678");
    await t.asSystem(async (tx) => {
      const [{ id: hoodie }] = await tx.query<{ id: string }>(`select id from shop_products order by sort limit 1`);
      await tx.query(
        `insert into shop_order_items (order_id, product_id, product_name, player_id, size, initials, quantity, unit_pence) values ($1, $2, 'Hoodie', $3, 'Youth M', 'YS', 1, 2500)`,
        [order, hoodie, DEV_IDS.yusuf],
      );
    });
  });

  it("confirms the order once, with the bank details and reference", async () => {
    const fetch = ok();
    await notifyParentOrder(order, "placed");
    await notifyParentOrder(order, "placed"); // a second call (a repeated tap, a reload) sends nothing
    const mails = sentTo(fetch);
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toEqual(["adnan@example.com"]);
    expect(mails[0].subject).toMatch(/^Your kit order DS-[0-9A-F]{6}$/);
    expect(mails[0].text).toContain("Sort code: 12-34-56");
    expect(mails[0].text).toContain(`Reference: ${mails[0].subject.slice(-9)}`);
    expect(mails[0].text).toContain("1 × Hoodie, size Youth M, initials YS (for Yusuf)");
    expect(mails[0].text).toContain("We'll email you when it's ready.");
    expect(await column("placed_email_at")).not.toBeNull();
  });

  it("sends payment received and ready only once the order has got there, each once", async () => {
    const fetch = ok();
    await notifyParentOrder(order, "paid"); // still waiting for the transfer: nothing
    await notifyParentOrder(order, "ready");
    expect(fetch).not.toHaveBeenCalled();

    await t.asSystem((tx) => tx.query(`update shop_orders set status = 'paid', paid_at = '2026-10-06T10:00:00Z' where id = $1`, [order]));
    await notifyParentOrder(order, "paid");
    await notifyParentOrder(order, "paid");
    await t.asSystem((tx) => tx.query(`update shop_orders set status = 'ready', ready_at = now() where id = $1`, [order]));
    await notifyParentOrder(order, "ready");
    await notifyParentOrder(order, "ready");
    const mails = sentTo(fetch);
    expect(mails.map((m) => m.subject)).toEqual([expect.stringMatching(/^Payment received for order DS-/), "Kit ready to collect on Friday"]);
    expect(mails[0].text).toContain("We've received your payment of £25 for order");
    expect(mails[0].text).toContain("on Tue 6 Oct");
    expect(mails[1].text).toContain("Yusuf's kit from order");
    expect(mails[1].text).toContain("Collect it from a coach at Friday's session.");
  });

  it("tells the parent about a cancelled order, mentioning the refund only if they'd paid", async () => {
    const fetch = ok();
    await t.asSystem((tx) => tx.query(`update shop_orders set status = 'cancelled', paid_at = now() where id = $1`, [order]));
    await notifyParentOrder(order, "cancelled");
    await notifyParentOrder(order, "cancelled");
    const mails = sentTo(fetch);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toMatch(/^Order DS-[0-9A-F]{6} cancelled$/);
    expect(mails[0].text).toContain("please speak to the club about your refund");
  });

  it("doesn't count a failed email as sent, and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(notifyParentOrder(order, "placed")).resolves.toBeUndefined();
    expect(await column("placed_email_at")).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/placed email for order DS-.* not sent/));
    const fetch = ok();
    await notifyParentOrder(order, "placed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
