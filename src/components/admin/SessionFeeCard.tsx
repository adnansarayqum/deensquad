import { FoldCard, Notice } from "@/components/admin/bits";
import { saveSessionFee } from "@/lib/gate/actions";
import { poundsText } from "@/lib/settings";

/**
 * Admin → Sessions: the session fee coaches take at the gate (pay as you go, no plan yet, and trial children), by card
 * on the club's machine. Folded like the weekly reminder; a plain form, admins only.
 */
export function SessionFeeCard({ pence, notice }: { pence: number; notice?: "saved" | "invalid" }) {
  return (
    <FoldCard id="session-fee" title={`Session fee at the gate: ${poundsText(pence)}`} open={Boolean(notice)}>
      <div className="flex flex-col gap-3 lg:max-w-3xl">
        {notice === "saved" ? <Notice>Saved.</Notice> : null}
        {notice === "invalid" ? <Notice tone="action">Type the fee in pounds, like 7 or 7.50.</Notice> : null}
        <p className="text-[15px] leading-[22px]">
          Pay-as-you-go families, children with no payment plan yet and trial children pay this at the gate. On the register the coach taps
          &ldquo;Paid {poundsText(pence)}&rdquo; once the card machine says approved, and the total for the session shows under the lists.
        </p>
        <form action={saveSessionFee} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="session-fee-input" className="field-label">
              Fee in pounds
            </label>
            <input id="session-fee-input" name="fee" inputMode="decimal" defaultValue={(pence / 100).toFixed(pence % 100 ? 2 : 0)} className="field w-32" required />
          </div>
          <button type="submit" className="btn-chunky btn-paper">
            Save fee
          </button>
        </form>
      </div>
    </FoldCard>
  );
}
