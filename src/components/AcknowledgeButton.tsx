"use client";

import { useState, useTransition } from "react";
import { track } from "@/lib/analytics";
import { acknowledgeAnnouncement } from "@/lib/parent/actions";
import { tapAction, TapProblem, type Problem } from "./TapProblem";

export function AcknowledgeButton({ announcementId }: { announcementId: string }) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const acknowledge = () =>
    startTransition(async () => {
      setProblem(null);
      const failed = await tapAction(() => acknowledgeAnnouncement(announcementId));
      if (failed) return setProblem(failed);
      track("news_acknowledged");
    });
  return (
    <>
      <button type="button" className="btn-chunky btn-grass w-full" disabled={pending} onClick={acknowledge}>
        {pending ? "Saving…" : "I've read this"}
      </button>
      {problem ? <TapProblem problem={problem} onRetry={acknowledge} retrying={pending} /> : null}
    </>
  );
}
