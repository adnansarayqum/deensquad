"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { buzz } from "@/lib/feedback/feedback";
import { toggleLike } from "@/lib/parent/actions";
import { tapAction, TapProblem, type Problem } from "./TapProblem";
import { LIKE_EVENT } from "./DoubleTapLike";

/** A heart under a news post: tap to like, tap again to take it back. The count is everyone's; who liked it is for staff. */
export function LikeButton({ announcementId, title, liked, likes }: { announcementId: string; title: string; liked: boolean; likes: number }) {
  const [state, setState] = useOptimistic({ liked, likes });
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  // Sends the state wanted (not "toggle"), so Try again after a lost answer can't undo the like it already saved.
  const set = (next: boolean) =>
    startTransition(async () => {
      setProblem(null);
      setState({ liked: next, likes: Math.max(0, likes + (next === liked ? 0 : next ? 1 : -1)) });
      if (next) buzz();
      const failed = await tapAction(() => toggleLike(announcementId, next));
      if (failed) {
        setProblem(failed);
        wanted.current = next;
      }
    });
  const wanted = useRef(!liked);
  const toggle = () => set(!state.liked);
  const retry = () => set(wanted.current);
  // A double tap on the post (DoubleTapLike) likes it; it never takes a like back.
  // Subscribed afresh each render, so it sees the heart as it is now.
  const shownLiked = state.liked;
  useEffect(() => {
    const onLike = (e: Event) => {
      if ((e as CustomEvent<string>).detail === announcementId && !shownLiked) set(true);
    };
    window.addEventListener(LIKE_EVENT, onLike);
    return () => window.removeEventListener(LIKE_EVENT, onLike);
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
      {problem ? <TapProblem problem={problem} onRetry={retry} retrying={pending} /> : null}
    </div>
  );
}
