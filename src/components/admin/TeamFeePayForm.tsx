"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importTeamFeePay, type TfpState } from "@/lib/payments/actions";
import type { PaymentState } from "@/lib/domain";

const WORDS: Record<PaymentState, string> = {
  active: "Monthly plan",
  self_reported: "Parent says it's set up",
  pay_as_you_go: "Pay as you go",
  missing: "No plan",
  overdue: "Overdue",
};

/** Upload the TeamFeePay export → see every change and every row that didn't match → apply. */
export function TeamFeePayForm() {
  const [state, run, pending] = useActionState<TfpState, FormData>(importTeamFeePay, { stage: "start" });

  if (state.stage === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-app bg-grass-tint px-4 py-3 text-[15px] leading-[22px] font-bold text-grass-text">
          Done. {state.applied} {state.applied === 1 ? "plan" : "plans"} updated, {state.unchanged} already right.
          {state.skipped?.length ? ` ${state.skipped.length} ${state.skipped.length === 1 ? "row" : "rows"} skipped.` : ""}
        </p>
        <Link href="/admin/families" className="btn-chunky btn-grass self-start">
          Go to families
        </Link>
      </div>
    );
  }

  const preview = state.stage === "preview";
  const changes = state.changes ?? [];
  const skipped = state.skipped ?? [];

  return (
    <form action={run} className="flex flex-col gap-4">
      {preview ? (
        <>
          <input type="hidden" name="csv" value={state.csv} />
          <section className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4" aria-labelledby="tfp-changes">
            <h2 id="tfp-changes" className="text-[17px] font-extrabold">
              {changes.length === 0 ? "Nothing to change" : `${changes.length} ${changes.length === 1 ? "plan" : "plans"} will change`}
            </h2>
            <p className="text-[15px]">{state.unchanged} already right in the app.</p>
            {changes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Plans that will change</caption>
                  <thead className="text-ink-muted">
                    <tr>
                      <th scope="col" className="py-1.5 pr-3 font-bold">
                        Child
                      </th>
                      <th scope="col" className="py-1.5 pr-3 font-bold">
                        Now
                      </th>
                      <th scope="col" className="py-1.5 font-bold">
                        Will be
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c) => (
                      <tr key={c.playerId} className="border-t border-line">
                        <th scope="row" className="py-1.5 pr-3 font-bold">
                          {c.child}
                          {c.byEmail ? <span className="block text-[12px] font-normal text-ink-muted">Matched by parent email (row {c.line})</span> : null}
                        </th>
                        <td className="py-1.5 pr-3">{WORDS[c.from]}</td>
                        <td className="py-1.5 font-bold">{WORDS[c.to]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
          {skipped.length > 0 ? (
            <section className="flex flex-col gap-2 rounded-app border-2 border-crest-gold bg-gold-tint px-4 py-3" aria-labelledby="tfp-skipped">
              <h2 id="tfp-skipped" className="text-[15px] font-bold">
                {skipped.length} {skipped.length === 1 ? "row" : "rows"} won&apos;t be used
              </h2>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {skipped.slice(0, 50).map((s) => (
                  <li key={`${s.line}-${s.who}`}>
                    Row {s.line}, {s.who}: {s.reason}
                  </li>
                ))}
              </ul>
              {skipped.length > 50 ? <p className="text-sm text-ink-muted">…and {skipped.length - 50} more.</p> : null}
            </section>
          ) : null}
        </>
      ) : (
        <div>
          <label htmlFor="tfp-file" className="field-label">
            TeamFeePay export (CSV)
          </label>
          <input
            id="tfp-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="block w-full rounded-[14px] border-2 border-dashed border-line bg-paper p-4 text-[15px] file:mr-3 file:rounded-xl file:border-0 file:bg-grass file:px-3 file:py-2 file:font-extrabold file:text-on-grass"
          />
        </div>
      )}

      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px]">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {preview ? (
          <>
            {changes.length > 0 ? (
              <button type="submit" name="intent" value="apply" className="btn-chunky btn-grass" disabled={pending}>
                {pending ? "Updating…" : `Update ${changes.length} ${changes.length === 1 ? "plan" : "plans"}`}
              </button>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/admin/families/teamfeepay" className="btn-chunky btn-paper">
              Start again
            </a>
          </>
        ) : (
          <button type="submit" name="intent" value="preview" className="btn-chunky btn-grass" disabled={pending}>
            {pending ? "Reading…" : "Check the file"}
          </button>
        )}
      </div>
    </form>
  );
}
