"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { buzz } from "@/lib/feedback/feedback";
import { toggleLike } from "@/lib/parent/actions";
import { tapAction, TapProblem, type Problem } from "./TapProblem";

/** A heart under a news post: tap to like, tap again to take it back. The count is everyone's; who liked it is for staff. */
export function LikeButton({ announcementId, title, liked, likes }: { announcementId: string; title: string; liked: boolean; likes: number }) {
  const [state, setState] = useOptimistic({ liked, likes });
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const toggle = () =>
    startTransition(async () => {
      setProblem(null);
      const next = !state.liked;
      setState({ liked: next, likes: Math.max(0, state.likes + (next ? 1 : -1)) });
      if (next) buzz();
      const failed = await tapAction(() => toggleLike(announcementId));
      if (failed) setProblem(failed);
    });
  const count = state.likes;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={state.liked}
        aria-label={`Like: ${title}${count ? `, ${count === 1 ? "1 like" : `${count} likes`}` : ""}`}
        onClick={toggle}
        className={`inline-flex min-h-12 items-center gap-1.5 self-start rounded-pill px-2 -ml-2 text-[15px] font-bold transition-colors ${
          state.liked ? "text-grass-text" : "text-ink-muted"
        }`}
      >
        <Heart aria-hidden size={22} fill={state.liked ? "currentColor" : "none"} key={state.liked ? "on" : "off"} className={state.liked ? "animate-pop" : undefined} />
        <span className="tabular-nums">{count ? count : "Like"}</span>
      </button>
      {problem ? <TapProblem problem={problem} onRetry={toggle} retrying={pending} /> : null}
    </div>
  );
}
