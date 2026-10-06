import type { Queryable } from "../db/types";
import { iso } from "../db/types";

// The club shop's queries. They run inside asUser(): parents see products and their own orders,
// staff see everything.

export type Product = {
  id: string;
  name: string;
  description: string | null;
  pricePence: number;
  sizes: string[];
  initialsPence: number | null;
  imageUrl: string | null;
  /** A photo link was pasted (or seeded) but hasn't been copied into the app yet, so no photo shows. */
  photoPending: boolean;
  active: boolean;
  sort: number;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price_pence: number;
  sizes: string[];
  initials_price_pence: number | null;
  image_url: string | null;
  image_file_id: string | null;
  active: boolean;
  sort: number;
};

const PRODUCT_COLUMNS = `id, name, description, price_pence, sizes::text[] as sizes, initials_price_pence, image_url, image_file_id, active, sort`;
const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  name: r.name,
  description: r.description,
  pricePence: r.price_pence,
  sizes: r.sizes ?? [],
  initialsPence: r.initials_price_pence,
  // Only a photo stored in the app is shown. A pasted link waits until it's been copied in (localiseProductImages):
  // linking straight to another site shows a broken image when that site refuses or the link dies.
  imageUrl: r.image_file_id ? `/api/files/${r.image_file_id}` : null,
  photoPending: !r.image_file_id && Boolean(r.image_url),
  active: r.active,
  sort: r.sort,
});

export async function loadProducts(tx: Queryable, { includeHidden = false } = {}): Promise<Product[]> {
  const rows = await tx.query<ProductRow>(
    `select ${PRODUCT_COLUMNS} from shop_products ${includeHidden ? "" : "where active"} order by sort, name`,
  );
  return rows.map(toProduct);
}

export async function loadProduct(tx: Queryable, id: string): Promise<Product | null> {
  const [row] = await tx.query<ProductRow>(`select ${PRODUCT_COLUMNS} from shop_products where id = $1`, [id]);
  return row ? toProduct(row) : null;
}

export type PayBy = "card" | "bank";

export type OrderStatus = "awaiting_payment" | "paid" | "ordered" | "ready" | "collected" | "cancelled";

export type OrderItem = {
  id: string;
  productName: string;
  childName: string | null;
  size: string | null;
  initials: string | null;
  quantity: number;
  linePence: number;
};

export type Order = {
  id: string;
  status: OrderStatus;
  payBy: PayBy;
  reference: string;
  totalPence: number;
  createdAt: string;
  paidAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  parentName: string | null;
  sumupCheckoutId: string | null;
  items: OrderItem[];
};

const ORDER_SQL = `
  select o.id, o.status::text as status, o.pay_by, o.total_pence, o.created_at, o.paid_at, o.ready_at, o.collected_at, o.sumup_checkout_id,
    g.first_name || ' ' || g.last_name as parent_name,
    coalesce(json_agg(json_build_object(
      'id', i.id, 'productName', i.product_name, 'childName', p.first_name, 'size', i.size, 'initials', i.initials,
      'quantity', i.quantity, 'linePence', i.quantity * (i.unit_pence + i.initials_pence)
    ) order by i.product_name) filter (where i.id is not null), '[]') as items
  from shop_orders o
  left join guardians g on g.id = o.guardian_id
  left join shop_order_items i on i.order_id = o.id
  left join players p on p.id = i.player_id`;

type OrderRow = {
  id: string;
  status: OrderStatus;
  pay_by: PayBy;
  total_pence: number;
  created_at: Date;
  paid_at: Date | null;
  ready_at: Date | null;
  collected_at: Date | null;
  sumup_checkout_id: string | null;
  parent_name: string | null;
  items: OrderItem[] | string;
};

const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  status: r.status,
  payBy: r.pay_by,
  reference: orderReference(r.id),
  totalPence: r.total_pence,
  createdAt: iso(r.created_at),
  paidAt: r.paid_at ? iso(r.paid_at) : null,
  readyAt: r.ready_at ? iso(r.ready_at) : null,
  collectedAt: r.collected_at ? iso(r.collected_at) : null,
  parentName: r.parent_name,
  sumupCheckoutId: r.sumup_checkout_id,
  items: typeof r.items === "string" ? (JSON.parse(r.items) as OrderItem[]) : r.items,
});

/** A parent's own orders (explicitly filtered: a parent who is also staff can read every order). */
export async function loadMyOrders(tx: Queryable): Promise<Order[]> {
  const rows = await tx.query<OrderRow>(`${ORDER_SQL} where o.guardian_id = my_guardian_id() group by o.id, g.id order by o.created_at desc limit 50`);
  return rows.map(toOrder);
}

export async function loadOrder(tx: Queryable, id: string): Promise<Order | null> {
  const [row] = await tx.query<OrderRow>(`${ORDER_SQL} where o.id = $1 group by o.id, g.id`, [id]);
  return row ? toOrder(row) : null;
}

/** Orders for the club. Card orders nobody paid for within a day (an abandoned payment page) are left out. */
export async function loadOrdersAdmin(tx: Queryable, statuses: OrderStatus[]): Promise<Order[]> {
  const rows = await tx.query<OrderRow>(
    `${ORDER_SQL} where o.status::text = any ($1::text[])
       and not (o.status = 'awaiting_payment' and o.pay_by = 'card' and o.created_at < now() - interval '1 day')
     group by o.id, g.id order by o.created_at desc limit 300`,
    [statuses],
  );
  return rows.map(toOrder);
}

export type SupplierLine = {
  productName: string;
  size: string | null;
  /** How many of them have initials, and which: ["MH", "YS ×2"]. */
  initials: number;
  initialsRequested: string[];
  quantity: number;
};

/** What to order from the supplier: everything paid and not yet ordered, by item and size. */
export async function loadSupplierTotals(tx: Queryable): Promise<SupplierLine[]> {
  return tx.query<SupplierLine>(
    `select i.product_name as "productName", i.size, sum(i.quantity)::int as quantity,
       sum(case when i.initials is not null then i.quantity else 0 end)::int as initials,
       coalesce(array_agg(i.initials || case when i.quantity > 1 then ' ×' || i.quantity else '' end order by i.initials)
         filter (where i.initials is not null), '{}')::text[] as "initialsRequested"
     from shop_order_items i join shop_orders o on o.id = i.order_id
     where o.status = 'paid'
     group by i.product_name, i.size
     order by i.product_name, i.size nulls first`,
  );
}

/** The short reference parents put on a bank transfer and staff search for in the bank statement. */
export function orderReference(id: string): string {
  return `DS-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function formatPence(pence: number): string {
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "Not paid yet",
  paid: "Paid",
  ordered: "Ordered from the supplier",
  ready: "Ready for Friday",
  collected: "Picked up",
  cancelled: "Cancelled",
};
