"use client";

import { useEffect } from "react";
import { trackOnce } from "@/lib/analytics";

/** Counts one order_placed for this order (once per tab, reloads included). Rendered only when analytics is on. Renders nothing. */
export function CountOrderPlaced({ order, pay }: { order: string; pay: "card" | "bank" }) {
  useEffect(() => {
    trackOnce(`order:${order}`, "order_placed", { pay });
  }, [order, pay]);
  return null;
}
