import { Check } from "lucide-react";
import { orderTimeline } from "@/lib/shop/timeline";
import type { Order } from "@/lib/shop/data";

const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

/** Placed → paid → ready → collected, with a tick and a date for each step that's done. */
export function OrderTimeline({ order }: { order: Order }) {
  return (
    <ol aria-label="Order progress" className="flex flex-col gap-2.5 rounded-app border-2 border-line bg-paper p-4">
      {orderTimeline(order).map((step) => (
        <li key={step.label} className="flex items-center gap-3 text-[15px]">
          {step.done ? (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-pill bg-grass text-on-grass">
              <Check aria-hidden size={16} strokeWidth={3} />
            </span>
          ) : (
            <span aria-hidden className="h-7 w-7 shrink-0 rounded-pill border-2 border-line" />
          )}
          <span className={step.done ? "font-bold" : "text-ink-muted"}>
            {step.label}
            {step.at ? <span className="font-normal text-ink-muted"> · {day.format(new Date(step.at))}</span> : null}
            <span className="sr-only">{step.done ? " (done)" : " (not yet)"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
