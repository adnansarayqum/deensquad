import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { CheckoutForm } from "@/components/shop/CheckoutForm";
import { removeFromBasket } from "@/lib/shop/actions";
import { formatPence } from "@/lib/shop/data";
import { getBasketPage } from "@/lib/shop/load";

export const metadata: Metadata = { title: "Basket" };

export default async function BasketPage() {
  const { lines, unavailable, totalPence, options } = await getBasketPage();
  return (
    <>
      <BackHeader back="/shop" backLabel="Club shop" title="Your basket" />
      <main className="flex flex-col gap-3 px-4 pt-4 pb-4">
        {unavailable > 0 ? (
          <p role="status" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px]">
            {unavailable === 1 ? "One item" : `${unavailable} items`} in your basket {unavailable === 1 ? "isn't" : "aren't"} sold any more and{" "}
            {unavailable === 1 ? "has" : "have"} been left out.
          </p>
        ) : null}

        {lines.length === 0 ? (
          <Card className="flex flex-col gap-3 p-4 text-[15px] leading-[22px]">
            Your basket is empty.
            <Link href="/shop" className="btn-chunky btn-paper">
              Browse the shop
            </Link>
          </Card>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {lines.map((l) => (
                <li key={l.index}>
                  <Card className="flex items-center gap-3 p-3.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-base font-bold">
                        {l.quantity > 1 ? `${l.quantity} × ` : ""}
                        {l.product.name}
                      </span>
                      <span className="text-sm text-ink-muted">
                        {[l.childName ? `For ${l.childName}` : null, l.size ? `Size ${l.size}` : null, l.initials ? `Initials ${l.initials}` : null]
                          .filter(Boolean)
                          .join(" · ") || "One size"}
                      </span>
                    </div>
                    <span className="font-extrabold tabular-nums">{formatPence(l.linePence)}</span>
                    <form action={removeFromBasket}>
                      <input type="hidden" name="index" value={l.index} />
                      <button
                        type="submit"
                        aria-label={`Remove ${l.product.name}`}
                        className="grid h-12 w-12 place-items-center rounded-xl text-ink-muted"
                      >
                        <Trash2 aria-hidden size={20} />
                      </button>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between px-1 pt-1">
              <span className="text-base font-bold">Total</span>
              <span className="font-display text-[34px] leading-none tabular-nums">{formatPence(totalPence)}</span>
            </div>
            <p className="px-1 text-sm text-ink-muted">The club orders your kit once you&apos;ve paid, and hands it out at Friday training.</p>
            <CheckoutForm options={options} total={formatPence(totalPence)} />
          </>
        )}
      </main>
    </>
  );
}
