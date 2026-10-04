import type { Metadata } from "next";
import Link from "next/link";
import { AdminTitle, Section } from "@/components/admin/bits";
import { OrderStatusPill } from "@/components/shop/OrderStatusPill";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { setOrderStatus } from "@/lib/shop/actions";
import { formatPence, loadOrdersAdmin, loadSupplierTotals, type Order, type OrderStatus } from "@/lib/shop/data";
import { paymentOptions } from "@/lib/shop/options";

export const metadata: Metadata = { title: "Shop" };

const OPEN: OrderStatus[] = ["awaiting_payment", "paid", "ordered", "ready"];
const CLOSED: OrderStatus[] = ["collected", "cancelled"];

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" });

/** The buttons for moving an order on. Mirrors the forward moves allowed in setOrderStatus. */
function nextSteps(o: Order): { status: OrderStatus; label: string; primary?: boolean }[] {
  switch (o.status) {
    case "awaiting_payment":
      return [
        { status: "paid", label: o.payBy === "bank" ? "Transfer received" : "Mark paid", primary: o.payBy === "bank" },
        { status: "cancelled", label: "Cancel" },
      ];
    case "paid":
      return [
        { status: "ordered", label: "Ordered from supplier", primary: true },
        { status: "ready", label: "Ready for Friday" },
        { status: "cancelled", label: "Cancel" },
      ];
    case "ordered":
      return [
        { status: "ready", label: "Ready for Friday", primary: true },
        { status: "cancelled", label: "Cancel" },
      ];
    case "ready":
      return [{ status: "collected", label: "Handed over", primary: true }];
    default:
      return [];
  }
}

export default async function AdminShopPage({ searchParams }: PageProps<"/admin/shop">) {
  const user = await requireStaff();
  const { view } = await searchParams;
  const past = view === "past";
  const { orders, supplier } = await asUser(user.id, async (tx) => ({
    orders: await loadOrdersAdmin(tx, past ? CLOSED : OPEN),
    supplier: past ? [] : await loadSupplierTotals(tx),
  }));

  return (
    <>
      <AdminTitle
        action={
          <Link href="/admin/shop/products" className="btn-chunky btn-paper btn-small">
            Items and prices
          </Link>
        }
      >
        Shop
      </AdminTitle>

      {paymentOptions().length < 2 ? (
        <p className="rounded-app bg-gold-tint px-3.5 py-3 text-[15px] leading-[22px]">
          {paymentOptions().length === 0
            ? "Parents can't check out yet. Add the club's bank details or SumUp key to open the shop."
            : paymentOptions()[0] === "card"
              ? "Parents can pay by card. Add the club's bank details to offer bank transfer too."
              : "Parents can pay by bank transfer. Add the club's SumUp key to take card payments too."}
        </p>
      ) : null}

      {!past && supplier.length > 0 ? (
        <Section title="To order from the supplier" aside={<span className="text-sm text-ink-muted">Not yet marked as ordered</span>}>
          <table className="w-full text-[15px]">
            <thead>
              <tr className="text-left text-label uppercase text-ink-muted">
                <th className="py-1 font-normal">Item</th>
                <th className="py-1 font-normal">Size</th>
                <th className="py-1 text-right font-normal">Qty</th>
                <th className="py-1 text-right font-normal">With initials</th>
              </tr>
            </thead>
            <tbody>
              {supplier.map((l) => (
                <tr key={`${l.productName}|${l.size}`} className="border-t-2 border-line">
                  <td className="py-2 font-bold">{l.productName}</td>
                  <td className="py-2">{l.size ?? "One size"}</td>
                  <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 text-right tabular-nums">{l.initials || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      <nav aria-label="Orders" className="flex gap-2">
        <Link href="/admin/shop" aria-current={!past ? "page" : undefined} className={`btn-chunky btn-small ${!past ? "btn-grass" : "btn-paper"}`}>
          Open orders
        </Link>
        <Link href="/admin/shop?view=past" aria-current={past ? "page" : undefined} className={`btn-chunky btn-small ${past ? "btn-grass" : "btn-paper"}`}>
          Collected and cancelled
        </Link>
      </nav>

      {orders.length === 0 ? <p className="text-[15px] text-ink-muted">No orders here.</p> : null}
      <ul className="flex flex-col gap-2">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-col gap-2.5 rounded-app border-2 border-line bg-paper px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-bold">
                {o.parentName ?? "Parent removed"} <span className="font-normal text-ink-muted">· {o.reference}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[13px] text-ink-muted">{date.format(new Date(o.createdAt))}</span>
                <OrderStatusPill status={o.status} payBy={o.payBy} />
              </span>
            </div>
            <ul className="flex flex-col gap-0.5 text-[15px]">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    {i.quantity} × {i.productName}
                    <span className="text-ink-muted">
                      {[i.size, i.initials ? `initials ${i.initials}` : null, i.childName ? `for ${i.childName}` : null].filter(Boolean).map((t) => ` · ${t}`)}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatPence(i.linePence)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[15px] font-extrabold tabular-nums">
                {formatPence(o.totalPence)}{" "}
                <span className="font-normal text-ink-muted">
                  {o.paidAt ? `paid by ${o.payBy === "bank" ? "transfer" : "card"}` : o.payBy === "bank" ? `transfer, ref ${o.reference}` : "card, not paid"}
                </span>
              </span>
              <div className="flex flex-wrap gap-2">
                {nextSteps(o).map((step) => (
                  <form key={step.status} action={setOrderStatus}>
                    <input type="hidden" name="order" value={o.id} />
                    <input type="hidden" name="status" value={step.status} />
                    {step.status === "cancelled" ? (
                      <button type="submit" className="min-h-11 px-2 text-sm font-bold text-ink-muted underline">
                        {step.label}
                      </button>
                    ) : (
                      <button type="submit" className={`btn-chunky btn-small ${step.primary ? "btn-grass" : "btn-paper"}`}>
                        {step.label}
                      </button>
                    )}
                  </form>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
