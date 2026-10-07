"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Check, QrCode, RotateCcw, TriangleAlert, WifiOff, X } from "lucide-react";
import type { ScanResult } from "@/lib/staff/checkin";
import { scanPass } from "@/lib/staff/actions";
import { FLAG_WORDS } from "@/lib/staff/flags";

const reasonText = {
  not_a_pass: "That isn't a Deen Squad attendance QR code.",
  unknown_child: "This QR code is for a child who is no longer at the club.",
} as const;

/** What the scanner shows: the server's answer, or that the answer never came back (no signal or a server fault). */
type Shown = ScanResult | { ok: false; reason: "no_signal"; token: string };

/**
 * Full-screen camera scanner for family gate passes. Each pass checks the family in straight away.
 * `disabled` on a day with no session (the register is showing the next one): the server would refuse anyway.
 */
export function PassScanner({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Shown | null>(null);
  const [retrying, setRetrying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const last = useRef<{ token: string; at: number } | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  /** Set once the scanner has been open, so focus goes back to "Scan QR codes" only after a close, not on first load. */
  const wasOpen = useRef(false);

  /** True while the scanner's own history entry is the current one. A ref, not history.state: Next replaces that state on a refresh (after each check-in). */
  const pushed = useRef(false);

  // The scanner is a history entry of its own (same address), so a phone's Back button closes it and stays on the
  // register. Close (X) and Escape go back through that entry too; popstate is what actually closes it.
  const openScanner = () => {
    setError(null);
    setResult(null);
    setOpen(true);
    history.pushState({ scanner: 1 }, "");
    pushed.current = true;
  };
  const closeScanner = useCallback(() => {
    if (pushed.current) {
      // Cleared first, so a second tap (or Escape) before popstate arrives doesn't go back a second page.
      pushed.current = false;
      history.back();
    } else setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) opener.current?.focus();
      return;
    }
    wasOpen.current = true;
    closer.current?.focus();
    const onPop = () => {
      pushed.current = false;
      setOpen(false);
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
  }, [open, closeScanner]);

  // A failed request isn't a bad pass: say so and keep the pass to try again.
  const send = useCallback(async (token: string) => {
    busy.current = true;
    try {
      setResult(await scanPass(token));
    } catch {
      setResult({ ok: false, reason: "no_signal", token });
    }
    setTimeout(() => {
      busy.current = false;
    }, 1500);
  }, []);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let cancelled = false;
    // Kept here, not read back from the <video>: by the time this effect is cleaned up on close, React has already
    // let go of the video element, and the camera would stay on.
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = stream;
        await video.current!.play();
      } catch {
        setError("The camera didn't open. Allow camera access for this site in your browser settings, then try again.");
        return;
      }
      const tick = async () => {
        if (cancelled) return;
        const v = video.current;
        const c = canvas.current;
        if (v && c && v.readyState >= 2 && !busy.current) {
          const w = 480;
          const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0, w, h);
          const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          const now = Date.now();
          // Ignore the same pass held up for a few seconds after it was scanned.
          if (code?.data && !(last.current?.token === code.data && now - last.current.at < 6000)) {
            last.current = { token: code.data, at: now };
            navigator.vibrate?.(80);
            await send(code.data);
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, send]);

  if (!open) {
    return (
      <button
        ref={opener}
        type="button"
        onClick={openScanner}
        disabled={disabled}
        className="btn-chunky btn-grass w-full disabled:opacity-60 disabled:shadow-none"
      >
        <QrCode aria-hidden size={22} />
        Scan QR codes
      </button>
    );
  }

  const retry = async (token: string) => {
    setRetrying(true);
    last.current = { token, at: Date.now() };
    await send(token);
    setRetrying(false);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan attendance QR codes" className="fixed inset-0 z-50 flex flex-col bg-pitch-deep text-on-pitch">
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
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),20px)]" aria-live="assertive">
        {error ? (
          <p className="rounded-app bg-orange-tint p-4 text-[15px] text-ink">{error}</p>
        ) : !result ? (
          <p className="text-center text-[15px] text-on-pitch-muted">Hold the parent&apos;s QR code inside the box.</p>
        ) : !result.ok && result.reason === "no_signal" ? (
          <div className="flex flex-col gap-3 rounded-app bg-orange-tint p-4 text-ink">
            <div className="flex items-center gap-3">
              <WifiOff aria-hidden size={28} className="shrink-0 text-kit-orange" />
              <p className="flex flex-col">
                <span className="text-[17px] font-bold">No signal – not checked in yet</span>
                <span className="text-[14px]">The QR code is fine. The app couldn&apos;t reach the club, so try again or use Mark here.</span>
              </p>
            </div>
            <button type="button" disabled={retrying} onClick={() => retry(result.token)} className="btn-chunky btn-grass w-full">
              <RotateCcw aria-hidden size={20} />
              {retrying ? "Trying…" : "Try again"}
            </button>
          </div>
        ) : !result.ok ? (
          <div className="flex items-center gap-3 rounded-app bg-orange-tint p-4 text-ink">
            <TriangleAlert aria-hidden size={28} className="shrink-0 text-kit-orange" />
            <p className="text-[17px] font-bold">{reasonText[result.reason]}</p>
          </div>
        ) : (
          <ChildResult child={result.child} />
        )}
      </div>
    </div>
  );
}

function ChildResult({ child: c }: { child: Extract<ScanResult, { ok: true }>["child"] }) {
  const here = c.status !== "no_session_today";
  const tone = !here ? "bg-paper" : c.flags.length ? "bg-orange-tint" : "bg-grass-tint";
  return (
    <div className={`flex items-center gap-4 rounded-app p-4 text-ink ${tone}`}>
      <span
        className={`grid h-16 w-16 shrink-0 place-items-center rounded-pill ${here ? "bg-grass text-on-grass" : "bg-line text-ink-muted"}`}
      >
        {here ? <Check aria-hidden size={34} strokeWidth={3} /> : <X aria-hidden size={30} />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-display text-[34px] leading-none tracking-[0.02em]">
          {c.firstName} {c.lastInitial}.
        </span>
        <span className="text-[15px] font-bold">
          {c.ageGroup} ·{" "}
          {c.status === "checked_in" ? "Checked in" : c.status === "already_here" ? "Already checked in" : "No session for this group today"}
        </span>
        {here && c.flags.length ? <span className="text-[14px]">Needs a word: {c.flags.map((f) => FLAG_WORDS[f]).join(", ")}</span> : null}
      </span>
    </div>
  );
}
