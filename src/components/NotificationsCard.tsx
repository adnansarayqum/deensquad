"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { savePushSubscription } from "@/lib/chase/actions";
import { blockedNotificationHelp } from "@/lib/notification-help";

type State = "hidden" | "offer" | "ios-install" | "working" | "blocked" | "done";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Offers notifications once, then keeps this device's subscription up to date. */
export function NotificationsCard({ publicKey }: { publicKey: string | null }) {
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
        const saved = await savePushSubscription(sub.toJSON() as never).catch(() => null);
        if (!cancelled) setState(saved?.ok ? "hidden" : "offer");
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
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const { ok } = await savePushSubscription(sub.toJSON() as never);
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
    <div role={off ? "region" : "status"} aria-label={off ? "Notifications are off" : undefined} className={`flex items-start gap-3 rounded-app p-4 ${off ? "bg-orange-tint text-ink" : "bg-paper shadow-card"}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${off ? "bg-kit-orange text-on-orange" : "bg-grass-tint text-grass-text"}`}>
        {off ? <BellOff aria-hidden size={22} /> : <BellRing aria-hidden size={22} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {state === "ios-install" ? (
          <p className="text-[15px] leading-[22px]">
            <b className="block text-[16px]">Your notifications are off</b>
            You&apos;ll miss cancelled sessions and messages from the coaches. On iPhone, add this app to your Home Screen first: tap Share,
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
              You&apos;ll miss cancelled sessions and messages from the coaches.
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
      They&apos;re blocked on this phone, so you&apos;ll miss cancelled sessions and messages from the coaches. {help.steps}
    </p>
  );
}
