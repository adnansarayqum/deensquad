// The life of a shop order, in one place. Everything that needs to know which moves are allowed, which statuses
// mean "the club has the money", or which buttons an admin gets reads it from here: the status action, the admin
// page's buttons, the parent's emails, and the takings figures. (Until 10 Nov 2026 the moves were a private table
// in the actions file, copied by hand into the admin page, and "paid" was a status list retyped in four queries.)
//
//   awaiting_payment ──► paid ──► ordered ──► ready ──► collected
//          │              │  └──────────────────▲
//          └──► cancelled ◄┴──── (also from ordered)
//
// Who moves it: a parent's card payment (confirmSumupPayment, the only move not made by an admin) takes
// awaiting_payment → paid; an admin makes every other move from /admin/shop (setOrderStatus). Nothing moves
// backwards, and collected and cancelled are final. Each move is one guarded UPDATE (`where status = any(from)`),
// so two taps, or a tap racing a card payment, can't apply a move twice. Pure: no database, safe to import anywhere.

export type PayBy = "card" | "bank";

/** In the order an order goes through them; cancelled last. */
export const ORDER_STATUSES = ["awaiting_payment", "paid", "ordered", "ready", "collected", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The moves allowed from each status. Forward only. */
export const ORDER_FLOW: Record<OrderStatus, readonly OrderStatus[]> = {
  awaiting_payment: ["paid", "cancelled"],
  paid: ["ordered", "ready", "cancelled"],
  ordered: ["ready", "cancelled"],
  ready: ["collected"],
  collected: [],
  cancelled: [],
};

export const isOrderStatus = (value: unknown): value is OrderStatus => typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);

export const canMove = (from: OrderStatus, to: OrderStatus): boolean => ORDER_FLOW[from].includes(to);

/** The statuses an order can be moved to `to` from: the guard for the UPDATE that makes the move. */
export const movesInto = (to: OrderStatus): OrderStatus[] => ORDER_STATUSES.filter((from) => canMove(from, to));

/** The club has the money: paid, and everything after it. Takings, supplier totals and the "paid" email go by this. */
export const PAID_STATUSES = ["paid", "ordered", "ready", "collected"] as const satisfies readonly OrderStatus[];

/** Placed and not cancelled: paid or not. */
export const LIVE_STATUSES = ["awaiting_payment", ...PAID_STATUSES] as const satisfies readonly OrderStatus[];

/** Still needs something from the club or the parent, and the two ways an order ends. */
export const OPEN_STATUSES = ["awaiting_payment", "paid", "ordered", "ready"] as const satisfies readonly OrderStatus[];
export const CLOSED_STATUSES = ["collected", "cancelled"] as const satisfies readonly OrderStatus[];

/** `'paid', 'ordered', 'ready', 'collected'` for a query's `status in (…)`. Fixed words from this file, never input. */
export const sqlList = (statuses: readonly OrderStatus[]): string => statuses.map((s) => `'${s}'`).join(", ");

/** The parent's email a move sets off, if any (each goes once; see notifyParentOrder). */
export const EMAIL_ON_MOVE: Partial<Record<OrderStatus, "paid" | "ready" | "cancelled">> = { paid: "paid", ready: "ready", cancelled: "cancelled" };

export type AdminStep = { status: OrderStatus; label: string; primary?: boolean };

/** What an admin calls each move, in the order the buttons show. Every allowed move has a word here (the test checks). */
const STEP_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "",
  paid: "Mark paid",
  ordered: "Ordered from supplier",
  ready: "Ready for Friday",
  collected: "Handed over",
  cancelled: "Cancel",
};

/**
 * The buttons for moving an order on, straight from ORDER_FLOW. The first move is the usual one and is the primary
 * button, except that a card order waiting for payment has none: its payment normally arrives by itself, so "Mark
 * paid" there is the exception. A bank order's is "Transfer received".
 */
export function adminSteps(order: { status: OrderStatus; payBy: PayBy }): AdminStep[] {
  return ORDER_FLOW[order.status].map((status, i) => {
    const bank = order.status === "awaiting_payment" && order.payBy === "bank";
    const label = status === "paid" && bank ? "Transfer received" : STEP_LABEL[status];
    const primary = i === 0 && status !== "cancelled" && (order.status !== "awaiting_payment" || bank);
    return primary ? { status, label, primary } : { status, label };
  });
}
