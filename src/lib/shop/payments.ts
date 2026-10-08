import "server-only";

import { after } from "next/server";
import { enqueue } from "../background";
import { asSystem } from "../db";
import { notifyNewOrder, notifyParentOrder } from "./notify";
import { getCheckout, sumupConfigured } from "./sumup";

/**
 * Asks SumUp whether a checkout was paid, and if so marks its order paid.
 * Never trusts a webhook body or a redirect: the reference (the order id, plus `.<suffix>` on a retry) and the amount must match the order.
 */
export async function confirmSumupPayment(checkoutId: string): Promise<boolean> {
  if (!sumupConfigured()) return false;
  const checkout = await getCheckout(checkoutId);
  if (!checkout || checkout.status !== "PAID") return false;
  const paid = await asSystem(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `update shop_orders set status = 'paid', paid_at = now(), updated_at = now()
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
