"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

// Double-tap a news post to like it, as in the photo apps parents use every day. Only likes (never takes a like
// back, so a stray double tap can't undo one); the heart under the post fills and pops. Taps on buttons, links,
// videos and form fields are theirs, not the card's. The heart button stays the way to like for everyone else.

export const LIKE_EVENT = "ds-like";
const GAP_MS = 320;
const NEAR_PX = 32;

export function DoubleTapLike({ id, children }: { id: string; children: ReactNode }) {
  const last = useRef<{ at: number; x: number; y: number } | null>(null);
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    if ((e.target as Element).closest("a, button, input, textarea, select, label, video, summary, dialog")) {
      last.current = null;
      return;
    }
    const now = e.timeStamp;
    const prev = last.current;
    if (prev && now - prev.at < GAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < NEAR_PX) {
      last.current = null;
      window.dispatchEvent(new CustomEvent(LIKE_EVENT, { detail: id }));
      return;
    }
    last.current = { at: now, x: e.clientX, y: e.clientY };
  };
  return (
    // Touch only, and the same as the Like button under the post, which keyboards and screen readers use.
    <div onPointerUp={onPointerUp} className="flex flex-col">
      {children}
    </div>
  );
}
