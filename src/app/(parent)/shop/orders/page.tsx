import type { Metadata } from "next";
import Link from "next/link";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { OrderStatusPill } from "@/components/shop/OrderStatusPill";
import { formatPence } from "@/lib/shop/data";
import { getMyOrdersPage } from "@/lib/shop/load";

export const metadata: Metadata = { title: "Your orders" };

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default async function OrdersPage() {
  const { orders } = await getMyOrdersPage();
  return (
    <>
      <BackHeader back="/shop" backLabel="Club shop" title="Your orders" />
      <main className="flex flex-col gap-2 px-4 pt-4 pb-4">
        {orders.length === 0 ? <Card className="p-4 text-[15px] leading-[22px]">You haven&apos;t ordered anything yet. Order kit in the shop and collect it at Friday training.</Card> : null}
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/shop/orders/${o.id}`}
            className="flex flex-col gap-2 rounded-app bg-paper shadow-card p-3.5 transition-transform active:scale-[0.99]"
          >
            <span className="flex items-center justify-between gap-2">
              <OrderStatusPill status={o.status} payBy={o.payBy} />
              <span className="text-[15px] text-ink-muted">{date.format(new Date(o.createdAt))}</span>
            </span>
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-[15px] font-bold">
                {o.items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.productName}` : i.productName)).join(", ")}
              </span>
              <span className="font-bold tabular-nums">{formatPence(o.totalPence)}</span>
            </span>
          </Link>
        ))}
      </main>
    </>
  );
}
