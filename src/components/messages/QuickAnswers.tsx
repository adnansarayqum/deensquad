"use client";

import { useOptimistic, useState, useTransition } from "react";
import { answerNews } from "@/lib/messages/actions";
import { answerButtonName } from "@/lib/messages/quick-answers";
import { tapAction, TapProblem, type Problem } from "@/components/TapProblem";

export type QuickAnswerRow = {
  childId: string;
  /** The child's first name when the message reaches more than one of the family's children; null for just one. */
  childName: string | null;
  answer: string | null;
  /** "Answered by Sara" when the other parent gave it; null for this parent's own answer or none. */
  answeredBy: string | null;
};

/**
 * The quick-answer buttons on a club message: one row per child it reaches ("Yes for Yusuf" to a screen reader), the
 * chosen answer shown as a finished answer (ink border on cream, like "Not coming"). Tapping another changes it.
 */
export function QuickAnswers({ announcementId, title, options, rows }: { announcementId: string; title: string; options: string[]; rows: QuickAnswerRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <AnswerRow key={row.childId} announcementId={announcementId} title={title} options={options} row={row} />
      ))}
    </div>
  );
}

function AnswerRow({ announcementId, title, options, row }: { announcementId: string; title: string; options: string[]; row: QuickAnswerRow }) {
  const [optimistic, setOptimistic] = useOptimistic(row.answer);
  const [pending, startTransition] = useTransition();
  const [tapped, setTapped] = useState(false);
  const [failed, setFailed] = useState<{ problem: Problem; value: string } | null>(null);
  const choose = (value: string) =>
    startTransition(async () => {
      setFailed(null);
      setTapped(true);
      setOptimistic(value);
      const problem = await tapAction(() => answerNews(announcementId, row.childId, value));
      if (problem) setFailed({ problem, value });
    });
  return (
    <div className="flex flex-col gap-2">
      {row.childName ? <p className="text-[15px] font-bold">For {row.childName}</p> : null}
      <div role="group" aria-label={row.childName ? `${title}: ${row.childName}` : title} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const chosen = optimistic === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={chosen}
              aria-label={answerButtonName(option, row.childName)}
              onClick={() => choose(option)}
              className={`flex min-h-12 min-w-0 flex-1 basis-24 items-center justify-center rounded-app border-2 px-3 text-center text-base font-bold break-words transition-transform active:scale-[0.99] ${
                chosen ? "border-ink bg-cream text-ink" : "border-line bg-paper text-ink"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {failed && !pending ? (
        <TapProblem problem={failed.problem} onRetry={() => choose(failed.value)} />
      ) : (
        <p className="text-[15px] text-ink-muted" aria-live="polite">
          {pending
            ? "Saving…"
            : optimistic
              ? tapped || !row.answeredBy
                ? `Saved: ${optimistic}. The club can see it.`
                : `${optimistic} · answered by ${row.answeredBy}`
              : "Tap one. The club sees it straight away."}
        </p>
      )}
    </div>
  );
}
