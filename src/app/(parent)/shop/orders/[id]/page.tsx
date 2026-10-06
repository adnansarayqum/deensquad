import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { CountOrderPlaced } from "@/components/observability/TrackOnce";
import { OrderStatusPill } from "@/components/shop/OrderStatusPill";
import { OrderTimeline } from "@/components/shop/OrderTimeline";
import { payAgain } from "@/lib/shop/actions";
import { formatPence, type Order } from "@/lib/shop/data";
import { getOrderPage } from "@/lib/shop/load";
import { analyticsConfig } from "@/lib/observability/config";

export const metadata: Metadata = { title: "Your order" };

function message(order: Order, query: Record<string, string | string[] | undefined>): { tone: "done" | "action"; text: string } | null {
  if (order.status === "awaiting_payment" && order.payBy === "bank")
    return query.placed
      ? { tone: "done", text: "Order placed. Send the bank transfer below and we'll start on it once it arrives." }
      : { tone: "action", text: "We haven't had your transfer yet. It can take a day to show once you've sent it." };
  if (order.status === "awaiting_payment" && query.payment === "failed")
    return { tone: "action", text: "We couldn't open the payment page. Please try again in a minute." };
  if (order.status === "awaiting_payment" && query.return)
    return { tone: "action", text: "We haven't had your payment yet. If you've just paid, reload this page in a moment." };
  if (order.status === "awaiting_payment") return { tone: "action", text: "This order hasn't been paid yet." };
  if (order.status === "paid" && (query.return || query.paid))
    return { tone: "done", text: "Thank you, you've paid. We'll email you when it's ready to pick up on a Friday." };
  if (order.status === "paid" || order.status === "ordered")
    return { tone: "done", text: "Paid. We'll email you when it's ready to pick up on a Friday." };
  if (order.status === "ready") return { tone: "action", text: "Ready to pick up. Ask a coach at Friday's session." };
  return null;
}

/** Just placed: a bank order arriving from checkout, or a card order back from SumUp (or the demo) and paid. */
function justPlaced(order: Order, query: Record<string, string | string[] | undefined>): "card" | "bank" | null {
  if (order.payBy === "bank") return query.placed ? "bank" : null;
  const paid = order.status !== "awaiting_payment" && order.status !== "cancelled";
  return paid && (query.return || query.paid) ? "card" : null;
}

export default async function OrderPage({ params, searchParams }: PageProps<"/shop/orders/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const page = await getOrderPage(id);
  if (!page) notFound();
  const { order, canPayOnline, bank } = page;
  const note = message(order, query);
  // Page counting (when it's on): the order counts once, from this page, so it works without JavaScript at checkout.
  const placed = analyticsConfig() ? justPlaced(order, query) : null;
  return (
    <>
      <BackHeader back="/shop/orders" backLabel="Your orders" title="Your order">
        Order {order.reference}
      </BackHeader>
      <main className="flex flex-col gap-3 px-4 pt-4 pb-4">
        {placed ? <CountOrderPlaced order={order.id} pay={placed} /> : null}
        <div>
          <OrderStatusPill status={order.status} payBy={order.payBy} />
        </div>
        {note ? (
          <p role="status" className={`rounded-app px-3.5 py-3 text-[15px] ${note.tone === "done" ? "bg-grass-tint font-bold text-grass-text" : "bg-orange-tint"}`}>
            {note.text}
          </p>
        ) : null}
        <OrderTimeline order={order} />
        <Card className="divide-y-2 divide-line">
          {order.items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 p-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-bold">
                  {i.quantity > 1 ? `${i.quantity} × ` : ""}
                  {i.productName}
                </span>
                <span className="text-sm text-ink-muted">
                  {[i.childName ? `For ${i.childName}` : null, i.size ? `Size ${i.size}` : null, i.initials ? `Initials ${i.initials}` : null]
                    .filter(Boolean)
                    .join(" · ") || "One size"}
                </span>
              </div>
              <span className="font-extrabold tabular-nums">{formatPence(i.linePence)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between p-3.5">
            <span className="font-bold">Total</span>
            <span className="font-display text-[30px] leading-none tabular-nums">{formatPence(order.totalPence)}</span>
          </div>
        </Card>
        {order.status === "awaiting_payment" && order.payBy === "bank" ? (
          bank ? (
            <Card tone="gold" className="flex flex-col gap-2 p-4">
              <h2 className="text-[17px] font-extrabold">Pay by bank transfer</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
                <dt className="text-ink-muted">Amount</dt>
                <dd className="font-extrabold tabular-nums">{formatPence(order.totalPence)}</dd>
                <dt className="text-ink-muted">Account name</dt>
                <dd className="font-bold">{bank.accountName}</dd>
                <dt className="text-ink-muted">Sort code</dt>
                <dd className="font-bold tabular-nums">{bank.sortCode}</dd>
                <dt className="text-ink-muted">Account number</dt>
                <dd className="font-bold tabular-nums">{bank.accountNumber}</dd>
                <dt className="text-ink-muted">Reference</dt>
                <dd className="font-extrabold tracking-[0.04em]">{order.reference}</dd>
              </dl>
              <p className="text-sm text-ink-muted">Please use the reference so the club can match your payment to this order.</p>
            </Card>
          ) : (
            <Card className="p-4 text-[15px]">The club will send you its bank details. Use the reference {order.reference} when you pay.</Card>
          )
        ) : null}
        {order.status === "awaiting_payment" && order.payBy === "card" && canPayOnline ? (
          <form action={payAgain}>
            <input type="hidden" name="order" value={order.id} />
            <button type="submit" className="btn-chunky btn-grass w-full">
              Pay {formatPence(order.totalPence)}
            </button>
          </form>
        ) : null}
      </main>
    </>
  );
}
