import "server-only";

import { appUrl, bankDetails, shopOrdersEmails } from "../config";
import { asSystem } from "../db";
import { canSendEmail, sendEmails } from "../email/send";
import { newOrderEmail, orderEmail, type OrderEmailKind } from "../email/templates";
import { formatPence, loadOrder, type OrderItem } from "./data";

const describeLine = (i: OrderItem) =>
  `${i.quantity} × ${i.productName}${i.size ? `, size ${i.size}` : ""}${i.initials ? `, initials ${i.initials}` : ""}${i.childName ? ` (for ${i.childName})` : ""}`;

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
    const { sent } = await sendEmails(
      to.map((email) =>
        newOrderEmail({
          to: email,
          parentName: order.parentName ?? "A parent",
          reference: order.reference,
          total: formatPence(order.totalPence),
          paid: order.status === "paid",
          lines: order.items.map(describeLine),
          link: base ? `${base}/admin/shop` : null,
          appUrl: base,
        }),
      ),
    );
    // Nobody got it: release the claim so the next call (payment check, webhook) tries again.
    if (to.length && sent.length === 0) {
      console.error("[shop] order email not sent; will try again.");
      await asSystem((tx) => tx.query(`update shop_orders set notified_at = null where id = $1`, [orderId]));
    }
  } catch (error) {
    console.error("[shop] order email:", error instanceof Error ? error.message : error);
  }
}

// Each email to the parent has its own column (migration 0016), and goes only while the order is at that step.
const PARENT_EMAIL: Record<OrderEmailKind, { column: string; statuses: string[] }> = {
  placed: { column: "placed_email_at", statuses: ["awaiting_payment", "paid", "ordered", "ready", "collected"] },
  paid: { column: "paid_email_at", statuses: ["paid", "ordered", "ready", "collected"] },
  ready: { column: "ready_email_at", statuses: ["ready"] },
  cancelled: { column: "cancelled_email_at", statuses: ["cancelled"] },
};

const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

/**
 * Emails the parent who placed the order about a step: placed, payment received, ready to collect, cancelled.
 * Once each: the step's column is claimed first, so a repeated tap or a second payment check sends nothing more.
 * If the email doesn't go, the claim is released and it's logged; the order's status has already changed
 * and stays changed. Never throws.
 */
export async function notifyParentOrder(orderId: string, kind: OrderEmailKind): Promise<void> {
  const { column, statuses } = PARENT_EMAIL[kind];
  try {
    if (!canSendEmail()) return;
    const found = await asSystem(async (tx) => {
      const claimed = await tx.query<{ email: string | null; first_name: string | null }>(
        `update shop_orders o set ${column} = now()
         from guardians g
         where o.id = $1 and g.id = o.guardian_id and o.${column} is null and o.status::text = any ($2::text[]) and g.email is not null
         returning g.email, g.first_name`,
        [orderId, statuses],
      );
      if (!claimed.length) return null;
      const order = await loadOrder(tx, orderId);
      return order ? { order, email: claimed[0].email!, firstName: claimed[0].first_name ?? "" } : null;
    });
    if (!found) return;
    const { order, email, firstName } = found;
    const base = appUrl();
    const children = [...new Set(order.items.map((i) => i.childName).filter((n): n is string => Boolean(n)))];
    const { sent } = await sendEmails([
      orderEmail(kind, {
        to: email,
        firstName,
        reference: order.reference,
        total: formatPence(order.totalPence),
        payBy: order.payBy,
        lines: order.items.map(describeLine),
        children,
        bank: bankDetails(),
        paidOn: order.paidAt ? dayFormat.format(new Date(order.paidAt)) : null,
        wasPaid: order.paidAt !== null,
        link: base ? `${base}/shop/orders/${order.id}` : null,
        appUrl: base,
      }),
    ]);
    if (sent.length === 0) {
      console.error(`[shop] ${kind} email for order ${order.reference} not sent.`);
      await asSystem((tx) => tx.query(`update shop_orders set ${column} = null where id = $1`, [orderId]));
    }
  } catch (error) {
    console.error(`[shop] ${kind} email:`, error instanceof Error ? error.message : error);
  }
}
