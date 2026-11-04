import "server-only";

import { after } from "next/server";
import { enqueue } from "../background";
import { asSystem } from "../db";
import { notifyNewOrder, notifyParentOrder } from "./notify";
import { getCheckout, sumupConfigured } from "./sumup";

/**
 * Asks SumUp whether a checkout was paid, and if so marks its order paid.
 * Never trusts a webhook body or a redirect: the reference (the order id, plus `.<suffix>` on a retry) and the amount must match the order.
 * SumUp is only asked about a checkout that belongs to an order still awaiting payment, so a webhook with a made-up
 * or old id never makes the app call out.
 */
export async function confirmSumupPayment(checkoutId: string): Promise<boolean> {
  if (!sumupConfigured()) return false;
  const waiting = await asSystem((tx) =>
    tx.query(`select 1 from shop_orders where sumup_checkout_id = $1 and status = 'awaiting_payment'`, [checkoutId]),
  );
  if (waiting.length === 0) return false;
  const checkout = await getCheckout(checkoutId);
  if (!checkout || checkout.status !== "PAID") return false;
  const paid = await asSystem(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      // pay_by back to card: an order switched to bank transfer after a card payment that didn't go through can still
      // be paid on that SumUp page.
      `update shop_orders set status = 'paid', pay_by = 'card', paid_at = now(), updated_at = now()
       where sumup_checkout_id = $1 and id::text = split_part($2, '.', 1) and status = 'awaiting_payment' and total_pence = $3
       returning id`,
      [checkoutId, checkout.reference ?? "", Math.round((checkout.amount ?? -1) * 100)],
    );
    return rows[0]?.id ?? null;
  });
  if (paid) {
    // The club's email and the parent's receipt (neither throws; the order is paid whatever happens to them).
    const send = async () => {
      await notifyNewOrder(paid);
      await notifyParentOrder(paid, "paid");
    };
    // Both callers (the order page and the SumUp webhook) are requests, where after() is allowed, so the emails go
    // once the response has been sent, one task at a time, like the admin and checkout paths. Outside a request
    // after() throws; then they're sent inline.
    try {
      after(() => enqueue("order paid emails", send));
    } catch {
      await send();
    }
  }
  return Boolean(paid);
}

/** Card orders older than this are left for the club (SumUp's hosted checkouts don't last that long anyway). */
const SWEEP_DAYS = 7;
const SWEEP_MAX = 50;

/**
 * The hourly safety net for card payments: a parent who paid and closed the page before coming back, with a webhook
 * that never arrived, would otherwise sit on "awaiting payment" until they opened the order again. Asks SumUp about
 * each unpaid card order with a checkout, placed at least 10 minutes ago (so a payment in progress is left alone) and
 * in the last week, and confirms the ones SumUp says are paid, through the same checks as the webhook. Never throws.
 */
export async function sweepCardPayments(): Promise<{ checked: number; paid: number }> {
  const result = { checked: 0, paid: 0 };
  if (!sumupConfigured()) return result;
  const waiting = await asSystem((tx) =>
    tx.query<{ sumup_checkout_id: string }>(
      `select sumup_checkout_id from shop_orders
       where status = 'awaiting_payment' and sumup_checkout_id is not null
         and created_at < now() - interval '10 minutes' and created_at > now() - make_interval(days => $1::int)
       order by created_at limit $2::int`,
      [SWEEP_DAYS, SWEEP_MAX],
    ),
  );
  for (const { sumup_checkout_id } of waiting) {
    result.checked++;
    if (await confirmSumupPayment(sumup_checkout_id).catch(() => false)) result.paid++;
  }
  return result;
}
