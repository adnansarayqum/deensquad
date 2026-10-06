import "server-only";

import { asSystem } from "../db";
import { notifyNewOrder, notifyParentOrder } from "./notify";
import { getCheckout, sumupConfigured } from "./sumup";

/**
 * Asks SumUp whether a checkout was paid, and if so marks its order paid.
 * Never trusts a webhook body or a redirect: the reference and the amount must match the order.
 */
export async function confirmSumupPayment(checkoutId: string): Promise<boolean> {
  if (!sumupConfigured()) return false;
  const checkout = await getCheckout(checkoutId);
  if (!checkout || checkout.status !== "PAID") return false;
  const paid = await asSystem(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `update shop_orders set status = 'paid', paid_at = now(), updated_at = now()
       where sumup_checkout_id = $1 and id::text = $2 and status = 'awaiting_payment' and total_pence = $3
       returning id`,
      [checkoutId, checkout.reference ?? "", Math.round((checkout.amount ?? -1) * 100)],
    );
    return rows[0]?.id ?? null;
  });
  if (paid) {
    await notifyNewOrder(paid);
    // The parent's receipt. Both never throw; the order is paid whatever happens to the emails.
    await notifyParentOrder(paid, "paid");
  }
  return Boolean(paid);
}
