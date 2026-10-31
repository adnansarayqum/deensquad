import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Receipt, ShoppingBasket } from "lucide-react";
import { AppHeader, Card, ScreenTitle } from "@/components/ui";
import { ProductImage } from "@/components/shop/ProductImage";
import { formatPence } from "@/lib/shop/data";
import { getShopPage } from "@/lib/shop/load";

export const metadata: Metadata = { title: "Club shop" };

export default async function ShopPage() {
  const { products, basketCount } = await getShopPage();
  return (
    <>
      <AppHeader>
        <ScreenTitle>Club shop</ScreenTitle>
      </AppHeader>
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
                  className="flex h-full flex-col overflow-hidden rounded-app bg-paper shadow-card transition-transform active:scale-[0.99]"
                >
                  <ProductImage src={p.imageUrl} name={p.name} />
                  <span className="flex flex-1 flex-col gap-0.5 p-3">
                    <span className="text-[15px] leading-5 font-bold">{p.name}</span>
                    <span className="mt-auto flex items-center justify-between gap-1">
                      <span className="text-[15px] font-bold text-grass-text tabular-nums">{formatPence(p.pricePence)}</span>
                      <span className="flex items-center text-[13px] font-bold text-ink-muted">
                        View
                        <ChevronRight aria-hidden size={16} />
                      </span>
                    </span>
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
