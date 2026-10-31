"use client";

import { useState, useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { track } from "@/lib/analytics";
import { saved } from "@/lib/feedback/feedback";
import { setAllComing } from "@/lib/parent/actions";
import { tapAction, TapProblem, type Problem } from "./TapProblem";

/**
 * One tap for a family with several children at the same session: "Mark both as coming" answers Coming for every child shown
 * who hasn't said so yet. Each child's own buttons stay below it for a different answer.
 */
export function AllComing({ sessionId, kids }: { sessionId: string; kids: { id: string; firstName: string }[] }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  if (kids.length < 2) return null;
  const names = kids.map((c) => c.firstName);
  const who = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  // Says what the tap does ("Mark both as coming"). Answers are segmented switches, so this solid button never reads as one.
  const words = kids.length === 2 ? "Mark both as coming" : `Mark all ${kids.length} as coming`;
  const tap = () =>
    start(async () => {
      setProblem(null);
      const p = await tapAction(() => setAllComing(sessionId, kids.map((c) => c.id)));
      if (p) return setProblem(p);
      track("availability_answered", { answer: "coming" });
      saved(`Saved: ${who} are coming`);
    });
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={tap}
        disabled={pending}
        aria-label={`${words}: ${who}`}
        className="btn-chunky btn-grass min-h-12 w-full"
      >
        <CheckCheck aria-hidden size={20} strokeWidth={2.5} />
        {pending ? "Saving…" : words}
      </button>
      {problem && !pending ? <TapProblem problem={problem} onRetry={tap} /> : null}
    </div>
  );
}
