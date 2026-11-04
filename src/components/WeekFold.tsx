"use client";

import { useState, type ReactNode } from "react";

// One session in This week. Once every child has an answer it folds to one line ("Yusuf and Musa are coming") so the
// club's news is on the first screen. It's the same element before and after, and a session that was open when the
// page loaded stays open after the last answer: otherwise the tap that settles it would rebuild the pickers and
// close the card, taking away the "Tell the coaches why?" box the parent was about to use.
export function WeekFold({ settled, summary, children }: { settled: boolean; summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(!settled);
  return (
    <details className="group/week" open={open || !settled} onToggle={(e) => setOpen(e.currentTarget.open)}>
      {/* Hidden (not left out) while unsettled, so the browser doesn't add its own "Details" line. */}
      <summary hidden={!settled} className="flex min-h-12 cursor-pointer list-none items-center gap-3.5 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className={settled ? "border-t border-line" : "flex flex-col"}>{children}</div>
    </details>
  );
}
