import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { AddToBasketForm } from "@/components/shop/AddToBasketForm";
import { ProductImage } from "@/components/shop/ProductImage";
import { formatPence } from "@/lib/shop/data";
import { getProductPage } from "@/lib/shop/load";

export const metadata: Metadata = { title: "Club shop" };

export default async function ProductPage({ params }: PageProps<"/shop/[id]">) {
  const { id } = await params;
  const page = await getProductPage(id);
  if (!page) notFound();
  const { product, family } = page;
  return (
    <>
      <BackHeader back="/shop" backLabel="Club shop" title={product.name}>
        {formatPence(product.pricePence)}
        {product.initialsPence !== null ? ` · initials ${formatPence(product.initialsPence)} extra` : ""}
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <Card className="overflow-hidden">
          <ProductImage src={product.imageUrl} name={product.name} large />
          {product.description ? <p className="p-4 text-[15px] leading-[22px]">{product.description}</p> : null}
        </Card>
        <AddToBasketForm
          product={{
            id: product.id,
            name: product.name,
            sizes: product.sizes,
            initialsPrice: product.initialsPence !== null ? formatPence(product.initialsPence) : null,
          }}
          kids={family.children.map((c) => ({ id: c.id, firstName: c.firstName }))}
        />
      </main>
    </>
  );
}
