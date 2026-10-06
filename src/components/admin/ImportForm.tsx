"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importFamilies, type ImportState } from "@/lib/admin/actions";

export function ImportForm() {
  const [state, run, pending] = useActionState<ImportState, FormData>(importFamilies, { stage: "start" });

  if (state.stage === "done" && state.summary) {
    const s = state.summary;
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="rounded-app bg-grass-tint px-4 py-3 text-[15px] leading-[22px] font-bold text-grass-text">
          Imported. {s.childrenAdded} {s.childrenAdded === 1 ? "child" : "children"} added, {s.childrenUpdated} updated
          {s.rowsRepeated ? ` (${s.rowsRepeated} repeated ${s.rowsRepeated === 1 ? "row" : "rows"} merged)` : ""}. {s.parentsAdded}{" "}
          {s.parentsAdded === 1 ? "parent" : "parents"} added, {s.parentsUpdated} updated.
        </p>
        <p className="text-[15px] leading-[22px]">Next, send the invites from the Families page. Each parent gets a link to sign in.</p>
        <Link href="/admin/families" className="btn-chunky btn-grass self-start">
          Go to families
        </Link>
      </div>
    );
  }

  const preview = state.stage === "preview" && state.summary;

  return (
    <form action={run} className="flex flex-col gap-4">
      {preview ? (
        <>
          <input type="hidden" name="csv" value={state.csv} />
          <div className="flex flex-col gap-3 rounded-app border-2 border-line bg-paper p-4">
            <h2 className="text-[17px] font-extrabold">Check before importing</h2>
            <p className="text-[15px] leading-[22px]">
              {state.count} {state.count === 1 ? "row" : "rows"} ready: <b>{state.summary!.childrenAdded}</b> new{" "}
              {state.summary!.childrenAdded === 1 ? "child" : "children"}, <b>{state.summary!.childrenUpdated}</b> already in the app (will be
              updated), <b>{state.summary!.parentsAdded}</b> new {state.summary!.parentsAdded === 1 ? "parent" : "parents"}.
            </p>
            {state.summary!.rowsRepeated > 0 ? (
              <p className="text-[15px] leading-[22px]">
                <b>{state.summary!.rowsRepeated}</b> {state.summary!.rowsRepeated === 1 ? "row repeats" : "rows repeat"} another row in this sheet
                (merged).
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-ink-muted">
                  <tr>
                    <th className="py-1.5 pr-3 font-bold">Row</th>
                    <th className="py-1.5 pr-3 font-bold">Child</th>
                    <th className="py-1.5 pr-3 font-bold">Group</th>
                    <th className="py-1.5 font-bold">Parents</th>
                  </tr>
                </thead>
                <tbody>
                  {state.sample!.map((r) => (
                    <tr key={r.line} className="border-t border-line">
                      <td className="py-1.5 pr-3 tabular-nums">{r.line}</td>
                      <td className="py-1.5 pr-3 font-bold">{r.child}</td>
                      <td className="py-1.5 pr-3">{r.group}</td>
                      <td className="py-1.5">{r.parents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(state.count ?? 0) > (state.sample?.length ?? 0) ? (
              <p className="text-sm text-ink-muted">…and {(state.count ?? 0) - (state.sample?.length ?? 0)} more.</p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="file" className="field-label">
              Spreadsheet (CSV)
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full rounded-[14px] border-2 border-dashed border-line bg-paper p-4 text-[15px] file:mr-3 file:rounded-xl file:border-0 file:bg-grass file:px-3 file:py-2 file:font-extrabold file:text-on-grass"
            />
          </div>
          <details className="rounded-app border-2 border-line bg-paper px-4 py-3">
            <summary className="cursor-pointer text-[15px] font-bold">Or paste the rows</summary>
            <textarea name="csv" rows={8} className="field mt-3 font-mono !text-sm" placeholder="Child first name,Child last name,Age group,Parent first name,Parent email" />
          </details>
        </>
      )}

      {state.errors && state.errors.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 rounded-app bg-orange-tint px-4 py-3">
          <p className="text-[15px] font-bold">
            {state.errors.length} {state.errors.length === 1 ? "row needs" : "rows need"} fixing. {preview ? "These rows will be skipped:" : "Fix these and upload again:"}
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {state.errors.slice(0, 20).map((e) => (
              <li key={`${e.line}-${e.message}`}>
                Row {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {state.checks && state.checks.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-app border-2 border-crest-gold bg-gold-tint px-4 py-3">
          <p className="text-[15px] font-bold">
            Check {state.checks.length === 1 ? "this" : `these ${state.checks.length}`} before importing
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {state.checks.slice(0, 50).map((c) => (
              <li key={`${c.line}-${c.message}`}>
                Row {c.line}: {c.message}
              </li>
            ))}
          </ul>
          {state.checks.length > 50 ? <p className="text-sm text-ink-muted">…and {state.checks.length - 50} more.</p> : null}
          <p className="text-sm text-ink-muted">Groups by age are a best guess. Check against the club&apos;s rules.</p>
        </div>
      ) : null}
      {state.warnings && state.warnings.length > 0 ? (
        <details className="rounded-app bg-gold-tint px-4 py-3 text-sm">
          <summary className="cursor-pointer font-bold">
            {state.warnings.length} {state.warnings.length === 1 ? "note" : "notes"}
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {state.warnings.slice(0, 20).map((w) => (
              <li key={`${w.line}-${w.message}`}>
                Row {w.line}: {w.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px]">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {preview ? (
          <>
            <button type="submit" name="intent" value="apply" className="btn-chunky btn-grass" disabled={pending || state.errors?.length === state.count}>
              {pending ? "Importing…" : `Import ${state.count} ${state.count === 1 ? "row" : "rows"}`}
            </button>
            <Link href="/admin/families/import" className="btn-chunky btn-paper">
              Start again
            </Link>
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
