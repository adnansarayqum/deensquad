"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { blockedNotificationHelp } from "@/lib/notification-help";

type State = "hidden" | "offer" | "ios-install" | "working" | "blocked" | "done";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Sends the subscription to /api/push-subscription; true once the club has it. Gives up after 10 s. */
async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const res = await fetch("/api/push-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
      signal: abort.signal,
    });
    if (res.redirected || !res.ok) return false;
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return body?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Waits for a browser step that can hang (permission prompts, push services); null once it's taken too long. */
function within<T>(ms: number, work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]).finally(() => clearTimeout(timer));
}

/** Offers notifications once, then keeps this device's subscription up to date. */
/** `calm`: something more urgent on Home has the orange (`homeLead`), so "off" is drawn neutral. */
export function NotificationsCard({ publicKey, calm = false }: { publicKey: string | null; calm?: boolean }) {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    if (!publicKey) return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    let cancelled = false;
    (async () => {
      if (!supported) {
        if (ios && !standalone) setState("ios-install");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();
      if (Notification.permission === "granted") {
        // Keep the saved subscription fresh (it can change, or belong to whoever signed in last).
        const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
        // Only hidden once the club has the subscription: if saving failed, offer the button again.
        const saved = await saveSubscription(sub);
        if (!cancelled) setState(saved ? "hidden" : "offer");
      } else if (!cancelled) {
        // Blocked on this phone: say where to switch them back on, or the parent never hears from the club.
        setState(Notification.permission === "denied" ? "blocked" : "offer");
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState("blocked");
      // A service worker or push service that never answers would leave "Turning on…" for ever: offer it again.
      const reg = await within(15_000, navigator.serviceWorker.ready);
      const sub = reg ? await within(15_000, reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })) : null;
      const ok = sub ? await saveSubscription(sub) : false;
      setState(ok ? "done" : "offer");
    } catch {
      setState("offer");
    }
  }

  if (state === "hidden") return null;
  // Off is something to act on (the owner's request: say so where it can't be missed), so it uses the action colour;
  // once on, it says so quietly in green.
  const off = state !== "done";
  return (
    <div role={off ? "region" : "status"} aria-label={off ? "Notifications are off" : undefined} className={`flex items-start gap-3 rounded-app p-4 ${off && !calm ? "bg-orange-tint text-ink" : "bg-paper shadow-card"}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${off ? (calm ? "bg-fill text-ink" : "bg-kit-orange text-on-orange") : "bg-grass-tint text-grass-text"}`}>
        {off ? <BellOff aria-hidden size={22} /> : <BellRing aria-hidden size={22} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {state === "ios-install" ? (
          <p className="text-[15px] leading-[22px]">
            <b className="block text-[16px]">Your notifications are off</b>
            You&apos;ll miss cancelled sessions, messages from the coaches and hearing when your child gets a star. On iPhone, add this app to your Home Screen first: tap Share,
            then Add to Home Screen, then open it from there and tap Turn on notifications.
          </p>
        ) : state === "done" ? (
          <p className="text-[15px] font-bold text-grass-text">Notifications are on. You&apos;ll hear from the club straight away.</p>
        ) : state === "blocked" ? (
          <BlockedSteps />
        ) : (
          <>
            <p className="text-[15px] leading-[22px]">
              <b className="block text-[16px]">Your notifications are off</b>
              You&apos;ll miss cancelled sessions, messages from the coaches and hearing when your child gets a star.
            </p>
            <button type="button" onClick={enable} disabled={state === "working"} className="btn-chunky btn-grass btn-small self-start">
              {state === "working" ? "Turning on…" : "Turn on notifications"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function BlockedSteps() {
  // Only rendered after the effect has run in the browser, so navigator is there.
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const help = blockedNotificationHelp(navigator.userAgent, standalone);
  return (
    <p className="text-[15px] leading-[22px]">
      <b className="block text-[16px]">Your notifications are off</b>
      They&apos;re blocked on this phone, so you&apos;ll miss cancelled sessions, messages from the coaches and hearing when your child gets a star. {help.steps}
    </p>
  );
}
