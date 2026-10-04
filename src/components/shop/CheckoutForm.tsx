"use client";

import { useActionState, useState } from "react";
import { checkout, type CheckoutState } from "@/lib/shop/actions";

const LABELS = {
  card: { title: "Card", detail: "Pay now on SumUp's secure page" },
  bank: { title: "Bank transfer", detail: "We'll show you the club's bank details" },
} as const;

/** Choose card or bank transfer, then place the order. */
export function CheckoutForm({ options, total }: { options: ("card" | "bank")[]; total: string }) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(checkout, {});
  const [payBy, setPayBy] = useState(options[0]);
  if (options.length === 0) {
    return <p className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px]">The club is still setting up payments. Please check back soon.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="field-label">How would you like to pay?</legend>
        {options.map((o) => (
          <label
            key={o}
            className="flex min-h-14 items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-2 has-[:checked]:border-grass has-[:checked]:bg-grass-tint"
          >
            <input
              type="radio"
              name="payBy"
              value={o}
              checked={payBy === o}
              onChange={() => setPayBy(o)}
              className="h-5 w-5 accent-[var(--grass)]"
            />
            <span className="flex flex-col">
              <span className="text-base font-bold">{LABELS[o].title}</span>
              <span className="text-sm text-ink-muted">{LABELS[o].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "One moment…" : payBy === "card" ? `Pay ${total}` : "Place order"}
      </button>
    </form>
  );
}
