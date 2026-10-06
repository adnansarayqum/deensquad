"use client";

import { useState, useTransition } from "react";
import { track } from "@/lib/analytics";
import { acknowledgeAnnouncement } from "@/lib/parent/actions";
import { markJustRead } from "./ReadFocus";
import { tapAction, TapProblem, type Problem } from "./TapProblem";

/** "I've read this" on a message. Its name includes the headline, so a screen reader can tell several apart. */
export function AcknowledgeButton({ announcementId, title }: { announcementId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const acknowledge = () =>
    startTransition(async () => {
      setProblem(null);
      markJustRead(announcementId);
      const failed = await tapAction(() => acknowledgeAnnouncement(announcementId));
      if (failed) {
        markJustRead(null);
        return setProblem(failed);
      }
      track("news_acknowledged");
    });
  return (
    <>
      <button
        type="button"
        className="btn-chunky btn-grass w-full"
        disabled={pending}
        onClick={acknowledge}
        aria-label={pending ? undefined : `I've read this: ${title}`}
      >
        {pending ? "Saving…" : "I've read this"}
      </button>
      {problem ? <TapProblem problem={problem} onRetry={acknowledge} retrying={pending} /> : null}
    </>
  );
}
