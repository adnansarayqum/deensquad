import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTitle } from "@/components/admin/bits";
import { UUID } from "@/lib/auth/tokens";
import { requireAdmin } from "@/lib/auth/session";
import { emailConfigured } from "@/lib/email/send";
import { asUser } from "@/lib/db";
import { setOrderStatus } from "@/lib/shop/actions";
import { formatPence, loadOrder } from "@/lib/shop/data";

export const metadata: Metadata = { title: "Cancel order" };

// Cancelling an order can't be undone and emails the parent, so the Cancel button on /admin/shop comes here first.
// A plain form, so it works without JavaScript; setOrderStatus refuses a cancel without confirm=yes.
export default async function CancelOrderPage({ params }: PageProps<"/admin/shop/orders/[id]/cancel">) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const order = await asUser(user.id, (tx) => loadOrder(tx, id));
  if (!order) notFound();
  const cancellable = order.status === "awaiting_payment" || order.status === "paid" || order.status === "ordered";
  const who = order.parentName ? ` for ${order.parentName}` : "";

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <Link href="/admin/shop" className="inline-flex min-h-11 items-center text-sm font-bold text-grass-text">
        ← Shop
      </Link>
      <AdminTitle>{`Cancel order ${order.reference}${who}?`}</AdminTitle>
      {cancellable ? (
        <form action={setOrderStatus} className="flex flex-col gap-4 rounded-app border-2 border-line bg-paper p-4">
          <input type="hidden" name="order" value={order.id} />
          <input type="hidden" name="status" value="cancelled" />
          <input type="hidden" name="confirm" value="yes" />
          <ul className="flex flex-col gap-0.5 text-[15px]">
            {order.items.map((i) => (
              <li key={i.id}>
                {i.quantity} × {i.productName}
                <span className="text-ink-muted">
                  {[i.size, i.initials ? `initials ${i.initials}` : null, i.childName ? `for ${i.childName}` : null].filter(Boolean).map((t) => ` · ${t}`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[15px] font-bold">{emailConfigured() ? "The parent will be emailed. " : ""}This can&apos;t be undone.</p>
          {order.paidAt ? (
            <p className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px]">
              This order is paid ({formatPence(order.totalPence)}), so refund it separately{order.payBy === "card" ? " in SumUp" : " by bank transfer"}.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-chunky btn-paper border-kit-orange">
              Cancel order
            </button>
            <Link href="/admin/shop" className="btn-chunky btn-grass">
              Keep it
            </Link>
          </div>
        </form>
      ) : (
        <p className="rounded-app border-2 border-line bg-paper p-4 text-[15px]">
          {order.status === "cancelled" ? "This order is already cancelled." : "This order is ready or handed over, so it can't be cancelled here."}
        </p>
      )}
    </div>
  );
}
