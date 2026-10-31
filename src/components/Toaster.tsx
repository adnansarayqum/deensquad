"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { TOAST_EVENT } from "@/lib/feedback/feedback";

/**
 * The "Saved" note on parent screens: slides up just above the tab bar for two seconds after a tap saves, then
 * slides away. One at a time; a new one replaces the last. Hidden from screen readers (see feedback.ts).
 */
export function Toaster() {
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null);
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (!text) return;
      setMessage({ text, key: Date.now() });
      setShown(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setShown(false), 2200);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-[430px] justify-center px-4 transition-all duration-300 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
      style={{ bottom: "calc(var(--tab-bar-height, 84px) + 12px)" }}
    >
      {message ? (
        <span
          key={message.key}
          data-toast
          className="inline-flex max-w-full items-center gap-2 rounded-pill bg-pitch px-4 py-2.5 text-[15px] font-bold text-on-pitch shadow-card"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-pill bg-grass text-on-grass animate-pop">
            <Check size={13} strokeWidth={3.5} />
          </span>
          <span className="truncate">{message.text}</span>
        </span>
      ) : null}
    </div>
  );
}
