"use client";

import { useState, useTransition } from "react";
import { Sparkles, Undo2 } from "lucide-react";
import { useKeptActionState } from "@/components/submitKeepingInput";
import { draftProgressReport, saveProgressReport, type ProgressFormState } from "@/lib/progress/actions";
import { REPORT_MAX } from "@/lib/progress/ratings";

/**
 * One child's report for one month: the text box, "Draft with AI" (only when AI is set up; fills the box from the app's
 * facts, never saves), then Save draft and Publish (or, once published, Update and Back to draft). A plain form, so
 * saving works without JavaScript.
 */
export function ProgressReportForm({
  playerId,
  firstName,
  month,
  monthName,
  body,
  published,
  ai,
}: {
  playerId: string;
  firstName: string;
  month: string;
  monthName: string;
  body: string;
  published: boolean;
  ai: boolean;
}) {
  const [state, run, pending, keep] = useKeptActionState<ProgressFormState>(saveProgressReport, {});
  const [drafting, startDraft] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const id = `report-${month}`;
  const box = () => document.getElementById(id) as HTMLTextAreaElement | null;

  function draft() {
    const el = box();
    if (!el) return;
    const before = el.value;
    setMessage(null);
    startDraft(async () => {
      const result = await draftProgressReport(playerId, month, before).catch(() => ({
        error: "The AI couldn't help just now (check your signal). Your text is unchanged.",
        body: undefined,
      }));
      if (result.error || !result.body) {
        setMessage({ tone: "error", text: result.error ?? "The AI couldn't help just now." });
        return;
      }
      setUndo(before);
      el.value = result.body;
      setMessage({ tone: "info", text: "Here's a draft from the app's ratings, attendance and notes. Check every line and change anything before you save." });
    });
  }

  return (
    <form action={run} onSubmit={keep} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="player" value={playerId} />
      <input type="hidden" name="month" value={month} />
      <label htmlFor={id} className="field-label">
        {firstName}&apos;s report for {monthName}
      </label>
      <textarea id={id} name="body" rows={7} maxLength={REPORT_MAX} defaultValue={body} placeholder="What went well, what's improving and one thing to work on" className="field" />
      {ai ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={draft}
              disabled={drafting}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-pill border-2 border-grass bg-grass-tint px-3.5 text-sm font-extrabold text-grass-text disabled:opacity-60"
            >
              <Sparkles aria-hidden size={16} />
              {drafting ? "Drafting…" : "Draft with AI"}
            </button>
            {undo !== null ? (
              <button
                type="button"
                onClick={() => {
                  const el = box();
                  if (el) el.value = undo;
                  setUndo(null);
                  setMessage(null);
                }}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-pill border-2 border-line bg-paper px-3.5 text-sm font-extrabold text-ink-muted"
              >
                <Undo2 aria-hidden size={16} />
                Undo
              </button>
            ) : null}
          </div>
          <p className="text-[13px] text-ink-muted">Uses first names only. Nothing reaches parents until you publish.</p>
          {message ? (
            <p role={message.tone === "error" ? "alert" : "status"} className={`text-[14px] ${message.tone === "error" ? "text-ink" : "text-ink-muted"}`}>
              {message.text}
            </p>
          ) : null}
        </div>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] text-ink">
          {state.error}
        </p>
      ) : null}
      {state.saved && !pending ? (
        <p role="status" className="rounded-app bg-grass-tint px-3.5 py-3 text-[15px] font-bold text-grass-text">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="do" value="publish" className="btn-chunky btn-grass" disabled={pending}>
          {pending ? "Saving…" : published ? "Update report" : "Publish"}
        </button>
        <button type="submit" name="do" value="draft" className="btn-chunky btn-paper" disabled={pending}>
          {published ? "Back to draft" : "Save draft"}
        </button>
      </div>
    </form>
  );
}
