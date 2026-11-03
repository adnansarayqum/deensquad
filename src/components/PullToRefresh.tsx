"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshIfReachable } from "@/lib/client/register-refresh";

// Pull down at the top of the screen to refresh, as in most phone apps (Home, Sessions, the register). Only in the
// installed app: a browser tab has its own pull to refresh, and two would fight. It refreshes only once the server
// answers (refreshIfReachable), so a pull with no signal leaves the screen as it is instead of the phone's offline
// page; it says so instead. Touch only; everything here can also be had by reloading.

/** How far (px, after damping) the finger must pull before letting go refreshes. */
const TRIGGER = 64;
const MAX = 96;

function installed(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [state, setState] = useState<"idle" | "refreshing" | "offline">("idle");
  const [refreshing, startTransition] = useTransition();
  const start = useRef<number | null>(null);
  const distance = useRef(0);

  useEffect(() => {
    if (!installed()) return;
    const onStart = (e: TouchEvent) => {
      // Only from the very top of the page, one finger, and not inside a dialog or a box that scrolls itself.
      const target = e.target as Element | null;
      if (window.scrollY > 0 || e.touches.length !== 1 || target?.closest("dialog, [data-no-pull], input, textarea, select")) {
        start.current = null;
        return;
      }
      start.current = e.touches[0].clientY;
      distance.current = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        distance.current = 0;
        setPull(0);
        return;
      }
      distance.current = Math.min(MAX, dy * 0.5);
      setPull(distance.current);
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      const went = distance.current >= TRIGGER;
      distance.current = 0;
      setPull(0);
      if (!went) return;
      setState("refreshing");
      startTransition(async () => {
        const ok = await refreshIfReachable(() => router.refresh());
        setState(ok ? "idle" : "offline");
        if (!ok) setTimeout(() => setState("idle"), 3000);
      });
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const busy = state === "refreshing" || refreshing;
  if (!pull && !busy && state !== "offline") return null;
  const ready = pull >= TRIGGER;
  return (
    <div
      aria-hidden={state !== "offline"}
      role={state === "offline" ? "status" : undefined}
      className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-[430px] justify-center"
      style={{ top: `calc(env(safe-area-inset-top, 0px) + ${busy || state === "offline" ? 12 : Math.max(0, pull - 36)}px)` }}
    >
      {state === "offline" ? (
        <span className="rounded-pill bg-paper px-4 py-2 text-[15px] font-bold text-ink shadow-card">No signal. Try again in a moment.</span>
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-pill bg-paper text-grass-text shadow-card">
          <RefreshCw
            size={20}
            strokeWidth={2.4}
            className={busy ? "animate-spin motion-reduce:animate-none" : ""}
            style={busy ? undefined : { transform: `rotate(${(pull / TRIGGER) * 270}deg)`, opacity: ready ? 1 : 0.6 }}
          />
        </span>
      )}
    </div>
  );
}
