"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, RotateCcw, TriangleAlert, WifiOff, X } from "lucide-react";
import { ChildResult, reasonText } from "@/components/PassScanner";
import { useTapShield } from "@/components/TapShield";
import { refreshIfReachable, setScannerOpen } from "@/lib/client/register-refresh";
import { CLOSED, STALL_MS, cameraOn, givenUp, step, wantsCode, type ScannerState } from "@/lib/scanner/machine";
import { middleSquare, readCode, type Decode } from "@/lib/scanner/reader";
import { sendCode } from "@/lib/scanner/send";

// The rebuilt gate scanner (plan of 14 Nov 2026), tried beside the first one (PassScanner) behind "Try the new
// scanner". Four parts with one job each: the camera and the history entry here; what a picture holds in
// lib/scanner/reader; the request in lib/scanner/send; and every state and move between states in
// lib/scanner/machine, so this file only does what the current state asks for. Same screen and same words as the
// first scanner, plus two things it lacked: a "Reading" mark that shows pictures are being read, and a stalled state
// that says so and restarts when they stop (30 Oct 2026: the camera showed, and nothing was being read).

/** How long a camera may take to show its first picture before a still one counts as a stall. */
const START_GRACE_MS = 8000;

const BLOCKED_WORDS = {
  camera:
    "The camera didn't open. Allow the camera for this site in your phone's settings, then close this and tap Scan QR codes again. You can still use Mark here.",
  reader: "The scanner couldn't load. Check your signal and try again.",
} as const;

export function GateScanner({
  disabled = false,
  disabledReason,
  className = "w-full",
}: {
  disabled?: boolean;
  /** Why it can't be used yet ("Opens on Fri 23 Oct…"), as the button's title. */
  disabledReason?: string;
  /** Layout classes for the "Scan QR codes" button (full width by default). */
  className?: string;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(step, CLOSED);
  /** The newest state, for the camera loop and timers, which outlive a render. */
  const now = useRef<ScannerState>(state);
  useEffect(() => {
    now.current = state;
  }, [state]);
  const open = state.phase !== "closed";
  const on = cameraOn(state);
  /** True while pictures have been read in the last second: the "Reading" mark. */
  const [reading, setReading] = useState(false);
  const lastPicture = useRef(0);
  /** Keeps a double tap on Close off the page under the scanner (the header's Sign out): see TapShield. */
  const { shield, raise } = useTapShield();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  /** True while the scanner's own history entry is the current one. A ref, not history.state: Next replaces that on a refresh. */
  const pushed = useRef(false);

  // The scanner is a history entry of its own (same address), so a phone's Back button closes it and stays on the
  // register. Close (X) and Escape go back through that entry too; popstate is what actually closes it.
  const openScanner = () => {
    dispatch({ type: "open" });
    setScannerOpen(true);
    history.pushState({ scanner: 1 }, "");
    pushed.current = true;
  };
  const shut = useCallback(() => {
    dispatch({ type: "close" });
    raise();
  }, [raise]);
  const closeScanner = useCallback(() => {
    if (pushed.current) {
      // Cleared first, so a second tap (or Escape) before popstate arrives doesn't go back a second page.
      pushed.current = false;
      history.back();
    } else shut();
  }, [shut]);

  useEffect(() => {
    if (!open) {
      setScannerOpen(false);
      if (wasOpen.current) {
        opener.current?.focus();
        // The register under the scanner picks up everyone just checked in, only once the server answers.
        void refreshIfReachable(() => router.refresh());
      }
      return;
    }
    wasOpen.current = true;
    closer.current?.focus();
    const onPop = () => {
      pushed.current = false;
      shut();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeScanner();
      }
    };
    // The phone locked or the coach switched apps: close, which stops the camera.
    const onHide = () => {
      if (document.visibilityState === "hidden") closeScanner();
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [open, closeScanner, shut, router]);

  // The request: whenever the state says a code is being checked, send that code, once.
  const checking = state.phase === "checking" ? state.token : null;
  const attempt = state.last?.at ?? 0;
  useEffect(() => {
    if (!checking) return;
    let gone = false;
    void sendCode(checking).then((sent) => {
      if (gone) {
        // Closed while the answer was on its way: the child may be checked in, so the register is brought up to date.
        if (sent.kind === "answer") void refreshIfReachable(() => router.refresh());
        return;
      }
      if (sent.kind === "answer") dispatch({ type: "answer", result: sent.result, at: Date.now() });
      else if (sent.kind === "signedOut") dispatch({ type: "signedOut" });
      else dispatch({ type: "noAnswer", at: Date.now() });
    });
    return () => {
      gone = true;
    };
  }, [checking, attempt, router]);

  // The camera, and the loop that reads its pictures. Started again whenever `run` goes up (opened, or stalled).
  const run = state.run;
  useEffect(() => {
    if (!on) return;
    let frame = 0;
    let cancelled = false;
    // Kept here, not read back from the <video>: by the time this is cleaned up on close, React has let go of the
    // video element, and the camera would stay on.
    let stream: MediaStream | null = null;
    (async () => {
      // The decoder is loaded only when the scanner opens, so the register doesn't carry it on every visit.
      let decode: Decode;
      try {
        decode = (await import("jsqr")).default as unknown as Decode;
      } catch {
        if (!cancelled) dispatch({ type: "cameraFailed", why: "reader" });
        return;
      }
      try {
        // HD where the camera has it (an "ideal", so a camera without it still opens): the code on a parent's phone
        // is small in the picture.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = stream;
        await video.current!.play();
      } catch {
        if (!cancelled) dispatch({ type: "cameraFailed", why: "camera" });
        return;
      }
      if (cancelled) return;
      dispatch({ type: "cameraReady" });
      let pictures = 0;
      let lastTime = -1;
      const started = Date.now();
      const tick = () => {
        if (cancelled) return;
        try {
          const v = video.current;
          const c = canvas.current;
          const square = v && v.readyState >= 2 ? middleSquare(v.videoWidth, v.videoHeight) : null;
          // Alive means the loop is running and the camera's picture is moving on. A camera still warming up gets
          // START_GRACE_MS before a still picture counts as a stall (some phones take a few seconds to show one).
          const t = Date.now();
          const moving = v ? v.currentTime !== lastTime : false;
          if (v && moving) lastTime = v.currentTime;
          if (moving || t - started < START_GRACE_MS) lastPicture.current = t;
          if (v && c && square && moving) {
            if (now.current.phase === "stalled") dispatch({ type: "reading" });
            if (wantsCode(now.current, t)) {
              c.width = square.size;
              c.height = square.size;
              const ctx = c.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(v, square.x, square.y, square.side, square.side, 0, 0, square.size, square.size);
              pictures += 1;
              const read = readCode(decode, ctx.getImageData(0, 0, square.size, square.size).data, square.size, pictures);
              if (read.skipped) console.warn("[scanner] picture skipped:", read.skipped);
              if (read.code) {
                navigator.vibrate?.(80);
                dispatch({ type: "code", token: read.code, at: Date.now() });
              }
            }
          }
        } catch (error) {
          // Nothing in a single picture may stop the loop.
          console.warn("[scanner] picture skipped:", error instanceof Error ? error.message : error);
        }
        if (!cancelled) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, run]);

  // The watchdog: the "Reading" mark, and a stall when no picture has been read for STALL_MS while one should be.
  useEffect(() => {
    if (!on) return;
    lastPicture.current = Date.now();
    const timer = setInterval(() => {
      const quiet = Date.now() - lastPicture.current;
      setReading(quiet < 1000);
      const phase = now.current.phase;
      if (quiet >= STALL_MS && (phase === "looking" || phase === "result" || phase === "noSignal" || phase === "stalled")) {
        lastPicture.current = Date.now();
        dispatch({ type: "stalled" });
      }
    }, 250);
    return () => {
      clearInterval(timer);
      setReading(false);
    };
  }, [on, run]);

  if (!open) {
    return (
      <>
        <button
          ref={opener}
          type="button"
          onClick={openScanner}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className={`btn-chunky btn-grass disabled:opacity-60 disabled:shadow-none ${className}`}
        >
          <QrCode aria-hidden size={22} />
          Scan QR codes
        </button>
        {shield}
      </>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan attendance QR codes" data-scanner="new" className="fixed inset-0 z-50 flex flex-col bg-pitch-deep text-on-pitch">
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3">
        <h2 className="font-display text-[32px] leading-none tracking-[0.02em]">Scan QR codes</h2>
        <button
          ref={closer}
          type="button"
          onClick={closeScanner}
          className="grid h-12 w-12 place-items-center rounded-pill bg-pitch text-on-pitch"
          aria-label="Close the scanner"
        >
          <X aria-hidden size={24} />
        </button>
      </div>

      <div className="relative mx-4 aspect-square overflow-hidden rounded-app bg-black">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-[22px] border-4 border-floodlight" />
        <canvas ref={canvas} className="hidden" />
        {/* Shows the reader is alive. Not announced: the lines below say what's happening. */}
        {reading && state.phase !== "blocked" ? (
          <p aria-hidden data-reading className="absolute top-3 left-3 flex items-center gap-1.5 rounded-pill bg-black/60 px-2.5 py-1 text-[13px] font-bold text-on-pitch">
            <span className="h-2 w-2 animate-pulse rounded-pill bg-floodlight" />
            Reading
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),20px)]" aria-live="assertive">
        <Showing state={state} onRetry={() => dispatch({ type: "retry", at: Date.now() })} />
      </div>
    </div>
  );
}

/** What the scanner says for each state: exactly one of these at a time. */
function Showing({ state, onRetry }: { state: ScannerState; onRetry: () => void }) {
  switch (state.phase) {
    case "closed":
      return null;
    case "starting":
      return <p className="text-center text-[15px] text-on-pitch-muted">Opening the camera…</p>;
    case "blocked":
      return <p className="rounded-app bg-orange-tint p-4 text-[15px] text-ink">{BLOCKED_WORDS[state.why]}</p>;
    case "looking":
      return <p className="text-center text-[15px] text-on-pitch-muted">Hold the parent&apos;s QR code inside the box.</p>;
    case "stalled":
      return (
        <div className="flex items-center gap-3 rounded-app bg-orange-tint p-4 text-ink">
          <TriangleAlert aria-hidden size={28} className="shrink-0 text-kit-orange" />
          <p className="flex flex-col">
            <span className="text-[18px] font-bold">The scanner stopped. Restarting…</span>
            {givenUp(state) ? <span className="text-[14px]">It has stopped more than once. Close this and use Mark here if it doesn&apos;t come back.</span> : null}
          </p>
        </div>
      );
    case "checking":
      return <p className="text-center text-[18px] font-bold">Checking…</p>;
    case "noSignal":
      return (
        <div className="flex flex-col gap-3 rounded-app bg-orange-tint p-4 text-ink">
          <div className="flex items-center gap-3">
            <WifiOff aria-hidden size={28} className="shrink-0 text-kit-orange" />
            <p className="flex flex-col">
              <span className="text-[18px] font-bold">No signal – not checked in yet</span>
              <span className="text-[14px]">The QR code is fine. The app couldn&apos;t reach the club, so try again or use Mark here.</span>
            </p>
          </div>
          <button type="button" onClick={onRetry} className="btn-chunky btn-grass w-full">
            <RotateCcw aria-hidden size={20} />
            Try again
          </button>
        </div>
      );
    case "signedOut":
      return (
        <p className="rounded-app bg-orange-tint p-4 text-[18px] font-bold text-ink">You&apos;ve been signed out, so nobody was checked in. Close this and sign in again.</p>
      );
    case "result":
      return state.result.ok ? (
        <ChildResult key={`${state.result.child.id}:${state.result.child.session?.id ?? ""}`} child={state.result.child} />
      ) : (
        <div className="flex items-center gap-3 rounded-app bg-orange-tint p-4 text-ink">
          <TriangleAlert aria-hidden size={28} className="shrink-0 text-kit-orange" />
          <p className="text-[18px] font-bold">{reasonText[state.result.reason]}</p>
        </div>
      );
  }
}
