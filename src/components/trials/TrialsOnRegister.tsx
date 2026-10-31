"use client";

import { useState, useTransition } from "react";
import { Phone } from "lucide-react";
import { markTrialArrived } from "@/lib/trials/actions";
import { GatePayButton } from "../GatePayButton";
import { tapAction, TapProblem, type Problem } from "../TapProblem";
import { Pill } from "../ui";

export type TrialGateRow = { id: string; childName: string; ageGroup: string; parentName: string; phone: string | null; arrived: boolean; paid: string | null };

/**
 * Register → "Trials (n)": children booked on /trial for this session. They aren't in the club yet, so they have no
 * QR code: the coach taps Arrived and, once it's paid (card or cash), "Paid £7". The parent's number is a tap
 * away for a no-show.
 */
export function TrialsOnRegister({ sessionId, trials, fee, open }: { sessionId: string; trials: TrialGateRow[]; fee: string; open: boolean }) {
  return (
    <section aria-labelledby="register-trials" className="flex flex-col gap-2.5">
      <h3 id="register-trials" className="mt-1 text-[13px] font-bold text-ink-muted">
        Trials ({trials.length})
      </h3>
      <ul className="flex flex-col gap-2.5">
        {trials.map((t) => (
          <li key={t.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 py-2.5 pr-3 pl-3 ${t.arrived ? "border-grass bg-grass-tint" : "border-line bg-paper"}`}>
            <span className="flex min-w-0 flex-1 basis-40 flex-col items-start gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold">{t.childName}</span>
                <Pill tone="neutral">Trial</Pill>
                <Pill tone="neutral">{t.ageGroup}</Pill>
              </span>
              <span className="text-[13px] text-ink-muted">
                {t.parentName}
                {t.phone ? (
                  <>
                    {" · "}
                    <a href={`tel:${t.phone.replace(/\s/g, "")}`} className="inline-flex min-h-12 items-center gap-1 font-bold text-grass-text underline" aria-label={`Call ${t.parentName}`}>
                      <Phone aria-hidden size={13} />
                      {t.phone}
                    </a>
                  </>
                ) : null}
              </span>
              {t.paid ? <GatePayButton sessionId={sessionId} id={t.id} kind="trial" name={t.childName} fee={fee} paid={t.paid} disabled={!open} /> : null}
            </span>
            <span className="flex flex-wrap items-center justify-end gap-1">
              {t.arrived && !t.paid ? <GatePayButton sessionId={sessionId} id={t.id} kind="trial" name={t.childName} fee={fee} paid={null} disabled={!open} /> : null}
              <ArrivedButton sessionId={sessionId} trialId={t.id} name={t.childName} arrived={t.arrived} disabled={!open} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArrivedButton({ sessionId, trialId, name, arrived, disabled }: { sessionId: string; trialId: string; name: string; arrived: boolean; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const run = () =>
    startTransition(async () => {
      setProblem(null);
      setProblem(await tapAction(() => markTrialArrived(sessionId, trialId, !arrived)));
    });
  return (
    <>
      {arrived ? (
        <button type="button" onClick={run} disabled={pending || disabled} aria-label={`Undo arrived for ${name}`} className="min-h-12 min-w-12 rounded-xl px-2 text-sm font-bold text-ink underline disabled:opacity-60">
          {pending ? "…" : "Undo"}
        </button>
      ) : (
        <button
          type="button"
          onClick={run}
          disabled={pending || disabled}
          aria-label={`${name} has arrived`}
          className="min-h-12 shrink-0 rounded-xl border border-line bg-paper px-3.5 text-sm font-bold text-grass-text shadow-[0_3px_0_var(--line)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-60 disabled:shadow-none"
        >
          {pending ? "Saving…" : "Arrived"}
        </button>
      )}
      {problem ? <TapProblem problem={problem} onRetry={run} retrying={pending} className="order-last basis-full" /> : null}
    </>
  );
}
