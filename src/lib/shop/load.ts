import "server-only";

import { cookies } from "next/headers";
import { UUID } from "../auth/tokens";
import { bankDetails } from "../config";
import { asUser } from "../db";
import { getFamily } from "../parent/load";
import { BASKET_COOKIE, parseBasket } from "./basket";
import { loadMyOrders, loadOrder, loadProduct, loadProducts, type Product } from "./data";
import { confirmSumupPayment } from "./payments";
import { paymentOptions } from "./options";
import { sumupConfigured } from "./sumup";

// Loaders for the parent shop screens. Each checks the session, then reads as that parent.

async function basketCount(): Promise<number> {
  return parseBasket((await cookies()).get(BASKET_COOKIE)?.value).reduce((n, l) => n + l.quantity, 0);
}

export async function getShopPage() {
  const { user, family } = await getFamily();
  const products = await asUser(user.id, (tx) => loadProducts(tx));
  return { family, products, basketCount: await basketCount() };
}

export async function getProductPage(id: string) {
  const { user, family } = await getFamily();
  if (!UUID.test(id)) return null;
  const product = await asUser(user.id, (tx) => loadProduct(tx, id));
  if (!product || !product.active) return null;
  return { family, product, basketCount: await basketCount() };
}

export type BasketView = {
  index: number;
  product: Product;
  childName: string | null;
  size: string | null;
  initials: string | null;
  quantity: number;
  linePence: number;
};

export async function getBasketPage() {
  const { user, family } = await getFamily();
  const lines = parseBasket((await cookies()).get(BASKET_COOKIE)?.value);
  const products = new Map((await asUser(user.id, (tx) => loadProducts(tx))).map((p) => [p.id, p]));
  const names = new Map(family.children.map((c) => [c.id, c.firstName]));
  const view: BasketView[] = [];
  let unavailable = 0;
  lines.forEach((line, index) => {
    const product = products.get(line.product);
    if (!product) return void unavailable++;
    const initialsPence = line.initials && product.initialsPence !== null ? product.initialsPence : 0;
    view.push({
      index,
      product,
      childName: line.player ? (names.get(line.player) ?? null) : null,
      size: line.size,
      initials: line.initials,
      quantity: line.quantity,
      linePence: line.quantity * (product.pricePence + initialsPence),
    });
  });
  return {
    lines: view,
    unavailable,
    totalPence: view.reduce((n, l) => n + l.linePence, 0),
    options: paymentOptions(),
  };
}

export async function getMyOrdersPage() {
  const { user } = await getFamily();
  return { orders: await asUser(user.id, loadMyOrders) };
}

export async function getOrderPage(id: string) {
  const { user } = await getFamily();
  if (!UUID.test(id)) return null;
  const read = () =>
    asUser(user.id, async (tx) => {
      const order = await loadOrder(tx, id);
      // Explicit: a parent who is also staff can read every order, but this screen is for their own.
      const [own] = await tx.query(`select 1 from shop_orders where id = $1 and guardian_id = my_guardian_id()`, [id]);
      return order && own ? order : null;
    });
  let order = await read();
  // Back from SumUp (or the webhook hasn't arrived yet): ask SumUp directly.
  if (order && order.status === "awaiting_payment" && order.sumupCheckoutId) {
    if (await confirmSumupPayment(order.sumupCheckoutId).catch(() => false)) order = await read();
  }
  return order ? { order, canPayOnline: sumupConfigured(), bank: bankDetails() } : null;
}
