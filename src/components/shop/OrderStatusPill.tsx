import { Pill } from "@/components/ui";
import { STATUS_LABEL, type OrderStatus, type PayBy } from "@/lib/shop/data";

const tone = {
  awaiting_payment: "action",
  paid: "neutral",
  ordered: "neutral",
  ready: "gold",
  collected: "done",
  cancelled: "neutral",
} as const satisfies Record<OrderStatus, "action" | "neutral" | "done" | "gold">;

export function OrderStatusPill({ status, payBy }: { status: OrderStatus; payBy: PayBy }) {
  const label = status === "awaiting_payment" && payBy === "bank" ? "Waiting for transfer" : STATUS_LABEL[status];
  return (
    <Pill tone={tone[status]} icon>
      {label}
    </Pill>
  );
}
