"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addToBasket, type AddState } from "@/lib/shop/actions";

type Kid = { id: string; firstName: string };

export function AddToBasketForm({
  product,
  kids,
}: {
  product: { id: string; name: string; sizes: string[]; initialsPrice: string | null };
  kids: Kid[];
}) {
  const [state, action, pending] = useActionState<AddState, FormData>(addToBasket, {});
  const [initials, setInitials] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="product" value={product.id} />
      {kids.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label">Who is it for?</legend>
          <div className="flex flex-wrap gap-2">
            {kids.map((k, i) => (
              <label key={k.id} className="choice-chip">
                <input type="radio" name="player" value={k.id} defaultChecked={i === 0} className="sr-only" />
                {k.firstName}
              </label>
            ))}
            {kids.length > 1 ? null : (
              <label className="choice-chip">
                <input type="radio" name="player" value="" className="sr-only" />
                Someone else
              </label>
            )}
          </div>
        </fieldset>
      ) : null}

      {product.sizes.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label">Size</legend>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map((s) => (
              <label key={s} className="choice-chip">
                <input type="radio" name="size" value={s} required className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {product.initialsPrice ? (
        <div>
          <label htmlFor="initials" className="field-label">
            Initials <span className="font-normal text-ink-muted">(optional, {product.initialsPrice} extra)</span>
          </label>
          <input
            id="initials"
            name="initials"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Up to 3 letters"
            maxLength={3}
            className="field tracking-[0.2em]"
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="quantity" className="field-label">
          How many
        </label>
        <select id="quantity" name="quantity" defaultValue="1" className="field">
          {Array.from({ length: 10 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.added && !pending ? (
        <p role="status" className="flex items-center justify-between gap-3 rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          Added to your basket.
          <Link href="/shop/basket" className="underline underline-offset-2">
            View basket
          </Link>
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Adding…" : "Add to basket"}
      </button>
    </form>
  );
}
