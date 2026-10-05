"use server";

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin, requireParent } from "../auth/session";
import { UUID } from "../auth/tokens";
import { appUrl } from "../config";
import { asSystem, asUser, isDemo } from "../db";
import { readUpload, saveFile } from "../files";
import { cleanText } from "../validate";
import { BASKET_COOKIE, addLine, parseBasket, type BasketLine } from "./basket";
import { orderReference } from "./data";
import { paymentOptions } from "./options";
import { notifyNewOrder } from "./notify";
import { localiseProductImages } from "./images";
import { createCheckout, sumupConfigured } from "./sumup";

const basketCookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 14 * 86400 };

async function readBasket(): Promise<BasketLine[]> {
  return parseBasket((await cookies()).get(BASKET_COOKIE)?.value);
}

async function writeBasket(basket: BasketLine[]) {
  const store = await cookies();
  if (basket.length) store.set(BASKET_COOKIE, JSON.stringify(basket), basketCookie);
  else store.delete(BASKET_COOKIE);
}

export type AddState = { error?: string; added?: boolean };

export async function addToBasket(_prev: AddState, formData: FormData): Promise<AddState> {
  const user = await requireParent();
  const product = formData.get("product");
  const player = formData.get("player");
  const size = cleanText(formData.get("size"), 30);
  const initials = cleanText(formData.get("initials"), 10)?.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || null;
  const quantity = Math.min(20, Math.max(1, Number(formData.get("quantity")) || 1));
  if (typeof product !== "string" || !UUID.test(product)) return { error: "Something went wrong. Reload and try again." };

  const check = await asUser(user.id, async (tx) => {
    const [p] = await tx.query<{ sizes: string[]; initials_price_pence: number | null }>(
      `select sizes, initials_price_pence from shop_products where id = $1 and active`,
      [product],
    );
    if (!p) return "This item isn't available any more.";
    if (p.sizes.length && (!size || !p.sizes.includes(size))) return "Choose a size.";
    if (initials && p.initials_price_pence === null) return "Initials aren't available on this item.";
    if (typeof player === "string" && player) {
      const mine = await tx.query(`select 1 where $1::uuid in (select my_player_ids())`, [player]);
      if (!mine.length) return "Choose who it's for.";
    }
    return null;
  });
  if (check) return { error: check };

  await writeBasket(
    addLine(await readBasket(), {
      product,
      player: typeof player === "string" && UUID.test(player) ? player : null,
      size: size ?? null,
      initials,
      quantity,
    }),
  );
  return { added: true };
}

export async function removeFromBasket(formData: FormData): Promise<void> {
  await requireParent();
  const index = Number(formData.get("index"));
  const basket = await readBasket();
  if (Number.isInteger(index) && index >= 0 && index < basket.length) await writeBasket(basket.filter((_, i) => i !== index));
  refresh();
}

async function baseUrl(): Promise<string | null> {
  const configured = appUrl();
  if (configured || process.env.NODE_ENV === "production") return configured;
  const host = (await headers()).get("host");
  return host ? `http://${host}` : null;
}

export type CheckoutState = { error?: string };

/** Places the order (prices from the database), then sends the parent to pay by card or shows the bank details. */
export async function checkout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await requireParent();
  const basket = await readBasket();
  if (basket.length === 0) return { error: "Your basket is empty." };
  const options = paymentOptions();
  const payBy = formData.get("payBy");
  if (options.length === 0) return { error: "The club hasn't set up payments yet. Please try again soon." };
  if (payBy !== "card" && payBy !== "bank") return { error: "Choose how you'd like to pay." };
  if (!options.includes(payBy)) return { error: "That way of paying isn't available. Choose another." };

  let orderId: string;
  try {
    [{ id: orderId }] = await asUser(user.id, (tx) => tx.query<{ id: string }>(`select place_order($1::text::jsonb, $2) as id`, [JSON.stringify(basket), payBy]));
  } catch (error) {
    console.error("[shop] place_order:", error instanceof Error ? error.message : error);
    await writeBasket([]);
    return { error: "Something in your basket has changed (an item, size or price). Please add it again." };
  }
  await writeBasket([]);

  if (payBy === "bank") {
    await notifyNewOrder(orderId);
    redirect(`/shop/orders/${orderId}?placed=1`);
  }
  if (isDemo()) {
    // The demo has no payment provider: pretend the card payment went through.
    await asSystem((tx) => tx.query(`update shop_orders set status = 'paid', paid_at = now() where id = $1`, [orderId]));
    await notifyNewOrder(orderId);
    redirect(`/shop/orders/${orderId}?paid=demo`);
  }

  const base = await baseUrl();
  const [{ total_pence }] = await asSystem((tx) => tx.query<{ total_pence: number }>(`select total_pence from shop_orders where id = $1`, [orderId]));
  let url: string;
  try {
    const sumup = await createCheckout({
      orderId,
      totalPence: total_pence,
      description: `Deen Squad kit order ${orderReference(orderId)}`,
      redirectUrl: `${base}/shop/orders/${orderId}?return=1`,
      returnUrl: `${base}/api/sumup/webhook`,
    });
    await asSystem((tx) => tx.query(`update shop_orders set sumup_checkout_id = $2 where id = $1`, [orderId, sumup.id]));
    url = sumup.url;
  } catch (error) {
    console.error("[shop] SumUp:", error instanceof Error ? error.message : error);
    redirect(`/shop/orders/${orderId}?payment=failed`);
  }
  redirect(url);
}

/** Try paying again for an order whose SumUp page timed out or was closed. */
export async function payAgain(formData: FormData): Promise<void> {
  const user = await requireParent();
  const id = formData.get("order");
  if (typeof id !== "string" || !UUID.test(id) || !sumupConfigured()) return;
  const [order] = await asUser(user.id, (tx) =>
    tx.query<{ id: string; total_pence: number }>(
      `select id, total_pence from shop_orders where id = $1 and guardian_id = my_guardian_id() and status = 'awaiting_payment' and pay_by = 'card'`,
      [id],
    ),
  );
  if (!order) redirect(`/shop/orders/${id}`);
  const base = await baseUrl();
  let url: string;
  try {
    // SumUp references must be unique, so a retry gets a fresh one.
    const sumup = await createCheckout({
      orderId: order.id,
      totalPence: order.total_pence,
      description: `Deen Squad kit order ${orderReference(order.id)}`,
      redirectUrl: `${base}/shop/orders/${order.id}?return=1`,
      returnUrl: `${base}/api/sumup/webhook`,
    });
    await asSystem((tx) => tx.query(`update shop_orders set sumup_checkout_id = $2 where id = $1`, [order.id, sumup.id]));
    url = sumup.url;
  } catch (error) {
    console.error("[shop] SumUp retry:", error instanceof Error ? error.message : error);
    redirect(`/shop/orders/${order.id}?payment=failed`);
  }
  redirect(url);
}

// Admin ------------------------------------------------------------------------

export type ProductFormState = { error?: string; saved?: boolean };

export async function saveProduct(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const user = await requireAdmin();
  const id = formData.get("id");
  const name = cleanText(formData.get("name"), 80);
  const price = Number(String(formData.get("price") ?? "").replace(/[£\s]/g, ""));
  const initialsText = String(formData.get("initialsPrice") ?? "").replace(/[£\s]/g, "");
  const initials = initialsText === "" ? null : Number(initialsText);
  const sizes = String(formData.get("sizes") ?? "")
    .split(",")
    .map((s) => s.trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 30);
  const link = cleanText(formData.get("imageUrl"), 1000);
  const upload = await readUpload(formData.get("photo"));
  const removePhoto = formData.get("removePhoto") === "on";
  if (!name) return { error: "Add the item's name." };
  if (!Number.isFinite(price) || price < 0 || price > 1000) return { error: "Add a price in pounds, like 15 or 7.50." };
  if (initials !== null && (!Number.isFinite(initials) || initials < 0 || initials > 100)) return { error: "The initials price should be in pounds, like 5." };
  if (link && !/^https:\/\//.test(link)) return { error: "The photo link should start with https://" };
  if (!upload.ok) return { error: upload.error };
  if (upload.upload?.mime === "application/pdf") return { error: "Use a photo (JPEG, PNG or WebP) for the item, not a PDF." };

  const values = [
    name,
    cleanText(formData.get("description"), 300),
    Math.round(price * 100),
    sizes,
    initials === null ? null : Math.round(initials * 100),
    formData.get("active") === "on",
    Number(formData.get("sort")) || 0,
  ];
  await asUser(user.id, async (tx) => {
    const existing = typeof id === "string" && UUID.test(id) ? id : null;
    const [row] = existing
      ? await tx.query<{ id: string; image_file_id: string | null }>(
          `update shop_products set name = $2, description = $3, price_pence = $4, sizes = $5::text[], initials_price_pence = $6, active = $7, sort = $8
           where id = $1 returning id, image_file_id`,
          [existing, ...values],
        )
      : await tx.query<{ id: string; image_file_id: string | null }>(
          `insert into shop_products (name, description, price_pence, sizes, initials_price_pence, active, sort) values ($1, $2, $3, $4::text[], $5, $6, $7)
           returning id, image_file_id`,
          values,
        );
    if (!row) return;
    // The photo: a new upload, a new link (copied in below), or taken off. Otherwise unchanged.
    if (upload.upload || link || removePhoto) {
      const fileId = upload.upload ? await saveFile(tx, upload.upload, user.staff.id) : null;
      await tx.query(`update shop_products set image_file_id = $2, image_url = $3 where id = $1`, [row.id, fileId, upload.upload ? null : link]);
      if (row.image_file_id) await tx.query(`delete from club_files where id = $1`, [row.image_file_id]);
    }
  });
  if (link) await localiseProductImages();
  refresh();
  return { saved: true };
}

// Forward moves only. Bank transfers are marked paid by staff when the money arrives.
const NEXT: Record<string, string[]> = {
  awaiting_payment: ["paid", "cancelled"],
  paid: ["ordered", "ready", "cancelled"],
  ordered: ["ready", "cancelled"],
  ready: ["collected"],
  collected: [],
  cancelled: [],
};

export async function setOrderStatus(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = formData.get("order");
  const status = String(formData.get("status"));
  if (typeof id !== "string" || !UUID.test(id) || !(status in NEXT)) return;
  const from = Object.entries(NEXT).filter(([, next]) => next.includes(status)).map(([s]) => s);
  await asUser(user.id, (tx) =>
    tx.query(
      `update shop_orders set status = $2::order_status, updated_at = now(),
         paid_at = case when $2 = 'paid' then coalesce(paid_at, now()) else paid_at end
       where id = $1 and status::text = any ($3::text[])`,
      [id, status, from],
    ),
  );
  refresh();
}
