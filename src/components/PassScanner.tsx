"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Check, QrCode, TriangleAlert, X } from "lucide-react";
import type { ScanResult } from "@/lib/staff/checkin";
import { scanPass } from "@/lib/staff/actions";

const flagText = { no_payment_plan: "No payment plan", missing_consent: "No photo consent", unread_news: "Hasn't read news", kit_ready: "Kit ready to collect" } as const;
const reasonText = {
  not_a_pass: "That isn't a Deen Squad pass.",
  unknown_child: "This pass is for a child who is no longer at the club.",
} as const;

/** Full-screen camera scanner for family gate passes. Each pass checks the family in straight away. */
export function PassScanner() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const last = useRef<{ token: string; at: number } | null>(null);

  const stop = useCallback(() => {
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
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
            busy.current = true;
            last.current = { token: code.data, at: now };
            navigator.vibrate?.(80);
            try {
              setResult(await scanPass(code.data));
            } catch {
              setResult({ ok: false, reason: "not_a_pass" });
            }
            setTimeout(() => {
              busy.current = false;
            }, 1500);
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stop();
    };
  }, [open, stop]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setResult(null);
          setOpen(true);
        }}
        className="btn-chunky btn-grass w-full"
      >
        <QrCode aria-hidden size={22} />
        Scan passes
      </button>
    );
  }


  return (
    <div role="dialog" aria-modal="true" aria-label="Scan gate passes" className="fixed inset-0 z-50 flex flex-col bg-pitch-deep text-on-pitch">
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3">
        <h2 className="font-display text-[32px] leading-none tracking-[0.02em]">Scan passes</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
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
          <p className="text-center text-[15px] text-on-pitch-muted">Hold the parent&apos;s pass inside the box.</p>
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
        {here && c.flags.length ? <span className="text-[14px]">Needs a word: {c.flags.map((f) => flagText[f]).join(", ")}</span> : null}
      </span>
    </div>
  );
}
