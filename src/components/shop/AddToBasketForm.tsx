"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type FormEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { addToBasket, type AddState } from "@/lib/shop/actions";
import { formatPence } from "@/lib/shop/data";
import { submitKeepingInput } from "@/components/submitKeepingInput";

type Kid = { id: string; firstName: string };

const MAX_QUANTITY = 10;

/** Children's and adults' sizes in their own rows ("Youth M (69-75cm chest)" under Kids as "M (69-75cm chest)"). */
function sizeRows(sizes: string[]): { label: string | null; sizes: string[] }[] {
  const kids = sizes.filter((s) => /^youth\b/i.test(s));
  const adults = sizes.filter((s) => /^adult\b/i.test(s));
  if (kids.length === 0 || adults.length === 0 || kids.length + adults.length !== sizes.length) return [{ label: null, sizes }];
  return [
    { label: "Kids", sizes: kids },
    { label: "Adults", sizes: adults },
  ];
}

export function AddToBasketForm({
  product,
  kids,
  basketCount,
}: {
  product: { id: string; name: string; sizes: string[]; pricePence: number; initialsPence: number | null };
  kids: Kid[];
  basketCount: number;
}) {
  const [state, run, pending] = useActionState<AddState, FormData>(addToBasket, {});
  const [initials, setInitials] = useState("");
  const [quantity, setQuantity] = useState(1);
  // A problem found in the browser before sending (no size or child chosen); the server checks again.
  const [local, setLocal] = useState<{ field: "size" | "player"; error: string } | null>(null);
  const sizeGroup = useRef<HTMLFieldSetElement>(null);
  const kidGroup = useRef<HTMLFieldSetElement>(null);

  const each = product.pricePence + (initials.length === 2 && product.initialsPence !== null ? product.initialsPence : 0);
  const total = each * quantity;
  // The server's answer counts once a new send has finished; a local problem is cleared on the next change.
  const problem = local ?? (state.error && !pending ? { field: state.field, error: state.error } : null);
  const count = state.added && !pending && state.basketCount !== undefined ? state.basketCount : basketCount;
  // With several children nobody is picked for them, so kit isn't ordered for the wrong one.
  const needsKid = kids.length > 1;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const data = new FormData(e.currentTarget);
    if (needsKid && !data.get("player")) {
      e.preventDefault();
      setLocal({ field: "player", error: "Choose who it's for." });
      kidGroup.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      kidGroup.current?.querySelector("input")?.focus({ preventScroll: true });
      return;
    }
    if (product.sizes.length > 0 && !data.get("size")) {
      e.preventDefault();
      setLocal({ field: "size", error: "Choose a size." });
      sizeGroup.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      sizeGroup.current?.querySelector("input")?.focus({ preventScroll: true });
      return;
    }
    setLocal(null);
    submitKeepingInput(run)(e);
  }

  const fieldError = (field: "size" | "player") =>
    problem?.field === field ? (
      <p id={`${field}-error`} className="text-[15px] font-bold text-kit-orange">
        {problem.error}
      </p>
    ) : null;

  return (
    <form action={run} onSubmit={onSubmit} onChange={() => setLocal(null)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="product" value={product.id} />
      {kids.length > 0 ? (
        <fieldset
          ref={kidGroup}
          aria-describedby={problem?.field === "player" ? "player-error" : undefined}
          className={`flex flex-col gap-2 rounded-app ${problem?.field === "player" ? "outline-2 outline-offset-4 outline-kit-orange" : ""}`}
        >
          <legend className="field-label">Who is it for?</legend>
          <div className="flex flex-wrap gap-2">
            {kids.map((k) => (
              <label key={k.id} className="choice-chip">
                <input type="radio" name="player" value={k.id} defaultChecked={!needsKid} className="sr-only" />
                {k.firstName}
              </label>
            ))}
            {needsKid ? null : (
              <label className="choice-chip">
                <input type="radio" name="player" value="" className="sr-only" />
                Someone else
              </label>
            )}
          </div>
          {fieldError("player")}
        </fieldset>
      ) : null}

      {product.sizes.length > 0 ? (
        <fieldset
          ref={sizeGroup}
          aria-describedby={problem?.field === "size" ? "size-error" : undefined}
          className={`flex flex-col gap-2 rounded-app ${problem?.field === "size" ? "outline-2 outline-offset-4 outline-kit-orange" : ""}`}
        >
          <legend className="field-label">Size</legend>
          {sizeRows(product.sizes).map((row) => (
            <div key={row.label ?? "all"} className="flex flex-col gap-1.5">
              {row.label ? <p className="text-[13px] font-bold text-ink-muted">{row.label}</p> : null}
              <div className="flex flex-wrap gap-2">
                {row.sizes.map((s) => (
                  <label key={s} className="choice-chip">
                    <input type="radio" name="size" value={s} required className="sr-only" />
                    {row.label ? (
                      <>
                        <span className="sr-only">{row.label} </span>
                        {s.replace(/^(Youth|Adult)\s+/i, "")}
                      </>
                    ) : (
                      s
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {fieldError("size")}
        </fieldset>
      ) : null}

      {product.initialsPence !== null ? (
        <div>
          <label htmlFor="initials" className="field-label">
            Initials <span className="font-normal text-ink-muted">(optional, 2 letters, {formatPence(product.initialsPence)} extra)</span>
          </label>
          <input
            id="initials"
            name="initials"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="2 letters"
            maxLength={2}
            className="field tracking-[0.2em]"
          />
        </div>
      ) : null}

      <div>
        <p id="quantity-label" className="field-label">
          How many
        </p>
        <input type="hidden" name="quantity" value={quantity} />
        <div role="group" aria-labelledby="quantity-label" className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="One fewer"
            className="btn-chunky btn-paper grid h-12 w-12 place-items-center p-0"
          >
            <Minus aria-hidden size={20} />
          </button>
          <output aria-live="polite" className="min-w-8 text-center font-display text-[32px] leading-none tabular-nums">
            {quantity}
          </output>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
            disabled={quantity >= MAX_QUANTITY}
            aria-label="One more"
            className="btn-chunky btn-paper grid h-12 w-12 place-items-center p-0"
          >
            <Plus aria-hidden size={20} />
          </button>
        </div>
      </div>

      {problem && problem.field === undefined ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {problem.error}
        </p>
      ) : null}
      {problem?.field ? (
        <p role="alert" className="sr-only">
          {problem.error}
        </p>
      ) : null}
      {state.added && !pending ? (
        <p role="status" className="flex items-center justify-between gap-3 rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          Added to your basket.
          <Link href="/shop/basket" className="underline underline-offset-2">
            View basket ({count})
          </Link>
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Adding…" : `Add to basket · ${formatPence(total)}`}
      </button>
      {count > 0 && !state.added ? (
        <Link href="/shop/basket" className="self-center py-3 text-[15px] font-bold text-grass-text underline underline-offset-2">
          View basket ({count})
        </Link>
      ) : null}
    </form>
  );
}
