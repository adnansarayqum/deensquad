import { Pill } from "@/components/ui";
import { STATUS_LABEL, type OrderStatus, type PayBy } from "@/lib/shop/data";

const tone = {
  awaiting_payment: "action",
  paid: "neutral",
  ordered: "neutral",
  ready: "action",
  collected: "done",
  cancelled: "neutral",
} as const satisfies Record<OrderStatus, "action" | "neutral" | "done">;

export function OrderStatusPill({ status, payBy }: { status: OrderStatus; payBy: PayBy }) {
  const label = status === "awaiting_payment" && payBy === "bank" ? "Waiting for transfer" : STATUS_LABEL[status];
  return (
    <Pill tone={tone[status]} icon>
      {label}
    </Pill>
  );
}
