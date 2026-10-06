import type { Order } from "./data";

export type TimelineStep = { label: string; done: boolean; at: string | null };

/**
 * The parent's view of where their order is: placed, paid, ready to collect, collected (each with its date once
 * done; orders from before migration 0016 have no ready or collected date). A cancelled order shows placed, then cancelled.
 */
export function orderTimeline(o: Pick<Order, "status" | "createdAt" | "paidAt" | "readyAt" | "collectedAt">): TimelineStep[] {
  const placed: TimelineStep = { label: "Placed", done: true, at: o.createdAt };
  if (o.status === "cancelled") {
    return [placed, ...(o.paidAt ? [{ label: "Paid", done: true, at: o.paidAt }] : []), { label: "Cancelled", done: true, at: null }];
  }
  const ready = o.status === "ready" || o.status === "collected";
  return [
    placed,
    { label: o.paidAt ? "Paid" : "Not paid yet", done: o.paidAt !== null, at: o.paidAt },
    { label: "Ready to collect", done: ready, at: ready ? o.readyAt : null },
    { label: "Collected", done: o.status === "collected", at: o.status === "collected" ? o.collectedAt : null },
  ];
}
