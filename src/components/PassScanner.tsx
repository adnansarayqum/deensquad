"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, HeartPulse, QrCode, RotateCcw, TriangleAlert, WifiOff, X } from "lucide-react";
import type { ScanResult } from "@/lib/staff/checkin";
import { ChildAvatar } from "./ChildAvatar";
import { FLAG_WORDS, PAYING_WORDS } from "@/lib/staff/flags";
import { poundsText } from "@/lib/settings";

const reasonText = {
  not_a_pass: "That isn't a Deen Squad attendance QR code.",
  unknown_child: "This QR code is for a child who is no longer at the club.",
} as const;

/** A scan with no answer after this long counts as no signal, so a hung request never freezes the scanner. */
const SCAN_TIMEOUT_MS = 10_000;

/** What the scanner shows: the server's answer, or that the answer never came back (no signal or a server fault). */
type Shown = ScanResult | { ok: false; reason: "no_signal"; token: string } | { ok: false; reason: "signed_out" };

/** Checks the child in through /api/coach/scan, which (unlike a Server Action) never queues behind a stuck request. */
async function checkIn(token: string): Promise<ScanResult | { ok: false; reason: "signed_out" }> {
  // A plain timer, not AbortSignal.timeout(), which older iPhones (iOS 15) don't have.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SCAN_TIMEOUT_MS);
  try {
    const res = await fetch("/api/coach/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: abort.signal,
    });
    if (res.status === 401 || res.redirected) return { ok: false, reason: "signed_out" };
    if (!res.ok) throw new Error(`scan failed (${res.status})`);
    return (await res.json()) as ScanResult;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full-screen camera scanner for family gate passes. Each pass checks the family in straight away.
 * `disabled` on a day with no session (the register is showing the next one): the server would refuse anyway.
 */
export function PassScanner({
  disabled = false,
  disabledReason,
  className = "w-full",
}: {
  disabled?: boolean;
  /** Why it can't be used yet ("Opens on Fri 23 Oct…"), as the button's title and description. */
  disabledReason?: string;
  /** Layout classes for the "Scan QR codes" button (full width by default). */
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Shown | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [checking, setChecking] = useState(false);
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
      if (wasOpen.current) {
        opener.current?.focus();
        // The register under the scanner picks up everyone just checked in (scans don't refresh it one by one).
        router.refresh();
      }
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
  }, [open, closeScanner, router]);

  // A failed request isn't a bad pass: say so and keep the pass to try again.
  // The last child's card goes while the next code is checked, so nobody is waved through on the wrong result.
  const send = useCallback(async (token: string) => {
    busy.current = true;
    setResult(null);
    setChecking(true);
    try {
      setResult(await checkIn(token));
    } catch {
      setResult({ ok: false, reason: "no_signal", token });
    } finally {
      setChecking(false);
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
      // The QR decoder is loaded only when the scanner opens, so the register doesn't carry it on every visit.
      let jsQR: typeof import("jsqr").default;
      try {
        jsQR = (await import("jsqr")).default;
      } catch {
        if (!cancelled) setError("The scanner couldn't load. Check your signal and try again.");
        return;
      }
      try {
        // HD where the camera has it (an "ideal", so a camera without it still opens): the code on a parent's phone
        // is small in the picture, and more pixels a square is what makes a dim or glary screen read.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = stream;
        await video.current!.play();
      } catch {
        setError(
          "The camera didn't open. Allow the camera for this site in your phone's settings, then close this and tap Scan QR codes again. You can still use Mark here.",
        );
        return;
      }
      let frames = 0;
      const tick = async () => {
        if (cancelled) return;
        try {
          await readFrame();
        } catch (error) {
          // jsQR throws on some noisy frames (dark venues, glare). One bad frame must never stop the scanner: before
          // this, the loop died silently and the camera kept showing with nothing read (Fri 30 Oct 2026).
          console.warn("[scanner] frame skipped:", error instanceof Error ? error.message : error);
        }
        if (!cancelled) frame = requestAnimationFrame(tick);
      };
      const readFrame = async () => {
        const v = video.current;
        const c = canvas.current;
        if (v && c && v.readyState >= 2 && v.videoWidth > 0 && !busy.current) {
          // The middle square of the camera's picture (what's inside the frame on screen), at up to 640 pixels a
          // side: the code fills more of it than of the whole picture squeezed to 480 wide, as it used to be.
          const side = Math.min(v.videoWidth, v.videoHeight);
          const size = Math.min(side, 640);
          c.width = size;
          c.height = size;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
          // Every other frame looks for a light-on-dark code too: a phone that darkens websites can show one that way.
          frames += 1;
          const code = jsQR(ctx.getImageData(0, 0, size, size).data, size, size, {
            inversionAttempts: frames % 2 ? "dontInvert" : "onlyInvert",
          });
          const now = Date.now();
          // Ignore the same pass held up for a few seconds after it was scanned.
          if (code?.data && !(last.current?.token === code.data && now - last.current.at < 6000)) {
            last.current = { token: code.data, at: now };
            navigator.vibrate?.(80);
            await send(code.data);
          }
        }
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
        title={disabled ? disabledReason : undefined}
        className={`btn-chunky btn-grass disabled:opacity-60 disabled:shadow-none ${className}`}
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
        ) : checking ? (
          <p className="text-center text-[17px] font-bold">Checking…</p>
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
        ) : !result.ok && result.reason === "signed_out" ? (
          <p className="rounded-app bg-orange-tint p-4 text-[17px] font-bold text-ink">
            You&apos;ve been signed out, so nobody was checked in. Close this and sign in again.
          </p>
        ) : !result.ok ? (
          <div className="flex items-center gap-3 rounded-app bg-orange-tint p-4 text-ink">
            <TriangleAlert aria-hidden size={28} className="shrink-0 text-kit-orange" />
            <p className="text-[17px] font-bold">{reasonText[result.reason]}</p>
          </div>
        ) : (
          <ChildResult key={`${result.child.id}:${result.child.session?.id ?? ""}`} child={result.child} />
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
      {c.photoId ? (
        // The parent's photo, with the result as a badge on it, so the coach can see it's the right child.
        <span className="relative shrink-0">
          <ChildAvatar photoId={c.photoId} firstName={c.firstName} size={72} />
          <span
            className={`absolute -right-1 -bottom-1 grid h-8 w-8 place-items-center rounded-pill border-2 border-paper ${here ? "bg-grass text-on-grass" : "bg-line text-ink-muted"}`}
          >
            {here ? <Check aria-hidden size={18} strokeWidth={3} /> : <X aria-hidden size={16} />}
          </span>
        </span>
      ) : (
        <span
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-pill ${here ? "bg-grass text-on-grass" : "bg-line text-ink-muted"}`}
        >
          {here ? <Check aria-hidden size={34} strokeWidth={3} /> : <X aria-hidden size={30} />}
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-display text-[34px] leading-none tracking-[0.02em]">
          {c.firstName} {c.lastInitial}.
        </span>
        <span className="text-[15px] font-bold">
          {c.ageGroup} ·{" "}
          {c.status === "checked_in" ? "Checked in" : c.status === "already_here" ? "Already checked in" : "No session for this group today"}
        </span>
        {here && c.flags.length ? <span className="text-[14px]">Needs a word: {c.flags.map((f) => FLAG_WORDS[f]).join(", ")}</span> : null}
        {/* How the family pays: pay as you go means taking today's session fee. */}
        {c.paying ? (
          <span className="mt-1 inline-flex items-center self-start rounded-pill border border-line bg-cream px-2.5 py-0.5 text-label text-ink uppercase">
            {PAYING_WORDS[c.paying]}
          </span>
        ) : null}
        {here && c.session && (c.paysAtGate || c.paidPence) ? <ScannerPay child={c} sessionId={c.session.id} /> : null}
        {/* Only a marker (the details are on the register, a tap away): other parents are at the gate. */}
        {c.medical ? (
          <span className="mt-1 inline-flex items-center gap-1 self-start rounded-pill border border-line bg-cream px-2.5 py-0.5 text-label text-ink uppercase">
            <HeartPulse aria-hidden size={13} />
            Medical info
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * "Paid £7" on the scanner's card for a child who pays at the gate, through /api/coach/payment (a route, so it never
 * waits behind a scan). The same 10 s timeout as a scan; a payment that didn't save says so with Try again.
 */
function ScannerPay({ child: c, sessionId }: { child: Extract<ScanResult, { ok: true }>["child"]; sessionId: string }) {
  const [paid, setPaid] = useState<number | null>(c.paidPence);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const name = `${c.firstName} ${c.lastInitial}.`;
  const send = async () => {
    setState("saving");
    setMessage(null);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), SCAN_TIMEOUT_MS);
    try {
      const res = await fetch("/api/coach/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: sessionId, child: c.id }),
        signal: abort.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || body.error) {
        setState("failed");
        setMessage(res.status === 401 ? "You've been signed out. Close this and sign in again." : (body.error ?? "That didn't save. Check your signal and try again."));
        return;
      }
      setPaid(c.feePence);
      setState("idle");
    } catch {
      setState("failed");
      setMessage("That didn't save. Check your signal and try again.");
    } finally {
      clearTimeout(timer);
    }
  };
  if (paid) {
    return <span className="mt-2 inline-flex items-center self-start rounded-pill bg-grass px-3 py-1 text-sm font-extrabold text-on-grass">Paid {poundsText(paid)}</span>;
  }
  return (
    <span className="mt-2 flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={send}
        disabled={state === "saving"}
        aria-label={`${name} paid ${poundsText(c.feePence)}`}
        className="btn-chunky btn-paper btn-small min-h-12"
      >
        {state === "saving" ? "Saving…" : state === "failed" ? "Try again" : `Paid ${poundsText(c.feePence)}`}
      </button>
      {message ? (
        <span role="alert" className="text-[14px]">
          {message}
        </span>
      ) : null}
    </span>
  );
}
