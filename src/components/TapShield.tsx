"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// A full-screen layer that closes on a tap (the scanner, the photo viewer) leaves the screen at once, so the
// second tap of a double tap on its Close button lands on whatever is under it. On staff phones that is the
// header's Sign out (11 Nov 2026: a double tap on the scanner's Close signed the coach out at the register).
// For a moment after such a layer closes, a clear sheet over the page takes any tap instead.

/** How long taps are kept off the page: longer than a double tap. */
const SHIELD_MS = 700;

/** `raise()` as the layer closes; render `shield` somewhere that stays mounted after it has gone. */
export function useTapShield(): { shield: ReactNode; raise: () => void } {
  const [up, setUp] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raise = useCallback(() => {
    setUp(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUp(false), SHIELD_MS);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { shield: up ? <div aria-hidden data-tap-shield className="fixed inset-0 z-50" /> : null, raise };
}
