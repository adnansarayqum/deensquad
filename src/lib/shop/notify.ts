import "server-only";

import { appUrl, shopOrdersEmails } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { newOrderEmail } from "../email/templates";
import { formatPence, loadOrder } from "./data";

/**
 * Emails the club about a new order, once: card orders when they're paid, bank transfers when placed.
 * Never throws; a failed email shouldn't lose the parent's order.
 */
export async function notifyNewOrder(orderId: string): Promise<void> {
  try {
    if (!canSendEmail()) return;
    const found = await asSystem(async (tx) => {
      const claimed = await tx.query(`update shop_orders set notified_at = now() where id = $1 and notified_at is null returning id`, [orderId]);
      if (!claimed.length) return null;
      const order = await loadOrder(tx, orderId);
      const admins = await tx.query<{ email: string }>(`select email from staff where role = 'admin' order by created_at`);
      return order ? { order, admins: admins.map((a) => a.email) } : null;
    });
    if (!found) return;
    const { order, admins } = found;
    const to = shopOrdersEmails().length ? shopOrdersEmails() : admins;
    const base = appUrl();
    await sendEmails(
      to.map((email) =>
        newOrderEmail({
          to: email,
          parentName: order.parentName ?? "A parent",
          reference: order.reference,
          total: formatPence(order.totalPence),
          paid: order.status === "paid",
          lines: order.items.map(
            (i) =>
              `${i.quantity} × ${i.productName}${i.size ? `, size ${i.size}` : ""}${i.initials ? `, initials ${i.initials}` : ""}${i.childName ? ` (for ${i.childName})` : ""}`,
          ),
          link: base ? `${base}/admin/shop` : null,
          appUrl: base,
        }),
      ),
    );
  } catch (error) {
    console.error("[shop] order email:", error instanceof Error ? error.message : error);
  }
}
