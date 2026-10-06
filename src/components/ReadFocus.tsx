"use client";

import { useEffect, useRef, type ReactNode } from "react";

// After "I've read this", the message moves from "Needs your tap" to "Earlier" and its button is gone, so focus
// would drop to the page and a screen reader would start again from the top. The button notes which message it
// was; that message's card in "Earlier" takes focus when it appears.
let justRead: string | null = null;

export function markJustRead(id: string | null) {
  justRead = id;
}

/** A message card under "Earlier": takes focus if it was read a moment ago on this screen. */
export function ReadFocus({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (justRead !== id) return;
    justRead = null;
    ref.current?.focus();
  }, [id]);
  return (
    <div ref={ref} tabIndex={-1} className={className}>
      {children}
    </div>
  );
}
