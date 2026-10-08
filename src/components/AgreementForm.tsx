"use client";

import { useActionState } from "react";
import { submitKeepingInput } from "@/components/submitKeepingInput";
import { signAgreement, type AgreementState } from "@/lib/parent/actions";

export function AgreementForm({ childId, childName, parentName }: { childId: string; childName: string; parentName: string }) {
  const [state, action, pending] = useActionState<AgreementState, FormData>(signAgreement, {});
  const box = "flex min-h-12 cursor-pointer items-start gap-3 rounded-app border-2 border-line bg-paper p-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint";
  return (
    <form action={action} onSubmit={submitKeepingInput(action)} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="child" value={childId} />
      <label className={box}>
        <input type="checkbox" name="playerAgrees" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--grass)]" />
        <span className="text-[15px] leading-[22px]">
          I&apos;ve gone through the player responsibilities with <b>{childName}</b>, who agrees to them.
        </span>
      </label>
      <label className={box}>
        <input type="checkbox" name="parentAgrees" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--grass)]" />
        <span className="text-[15px] leading-[22px]">I agree to the parent or guardian responsibilities.</span>
      </label>
      <div>
        <label htmlFor="parentName" className="field-label">
          Your full name, as your signature
        </label>
        <input id="parentName" name="parentName" defaultValue={parentName} autoComplete="name" maxLength={80} className="field" />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn-chunky btn-grass" disabled={pending}>
        {pending ? "Signing…" : "Sign the contract"}
      </button>
    </form>
  );
}
