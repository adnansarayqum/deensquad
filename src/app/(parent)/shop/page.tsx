import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, ShoppingBasket } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { ProductImage } from "@/components/shop/ProductImage";
import { formatPence } from "@/lib/shop/data";
import { getShopPage } from "@/lib/shop/load";

export const metadata: Metadata = { title: "Club shop" };

export default async function ShopPage() {
  const { products, basketCount } = await getShopPage();
  return (
    <>
      <BackHeader back="/checklist" backLabel="To-do" title="Club shop">
        Order kit here and pick it up at Friday training.
      </BackHeader>
      <main className="flex flex-col gap-3 px-4 pt-4 pb-4">
        <div className="grid grid-cols-2 gap-2">
          <Link href="/shop/basket" className="btn-chunky btn-paper btn-small">
            <ShoppingBasket aria-hidden size={18} />
            Basket{basketCount ? ` (${basketCount})` : ""}
          </Link>
          <Link href="/shop/orders" className="btn-chunky btn-paper btn-small">
            <Receipt aria-hidden size={18} />
            Your orders
          </Link>
        </div>

        {products.length === 0 ? (
          <Card className="p-4 text-[15px] leading-[22px]">The shop is empty at the moment. Check back soon.</Card>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/shop/${p.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-app border-2 border-line bg-paper shadow-lip-neutral transition-transform active:translate-y-1 active:shadow-none"
                >
                  <ProductImage src={p.imageUrl} name={p.name} />
                  <span className="flex flex-1 flex-col gap-0.5 p-3">
                    <span className="text-[15px] leading-5 font-bold">{p.name}</span>
                    <span className="text-[15px] font-extrabold text-grass-text tabular-nums">{formatPence(p.pricePence)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
