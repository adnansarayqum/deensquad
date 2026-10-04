"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { savePushSubscription } from "@/lib/chase/actions";

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
        await savePushSubscription(sub.toJSON() as never);
        if (!cancelled) setState("hidden");
      } else if (!cancelled) {
        setState(Notification.permission === "denied" ? "hidden" : "offer");
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
  return (
    <div className="flex items-start gap-3 rounded-app border-2 border-line bg-paper p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-tint text-gold-text">
        <BellRing aria-hidden size={22} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {state === "ios-install" ? (
          <p className="text-[15px] leading-[22px]">
            <b>Get a notification when the club posts.</b> On iPhone, add this app to your home screen first: tap Share, then Add to Home
            Screen, then open it from there.
          </p>
        ) : state === "done" ? (
          <p className="text-[15px] font-bold text-grass-text">Notifications are on. You&apos;ll hear from the club straight away.</p>
        ) : state === "blocked" ? (
          <p className="text-[15px] leading-[22px]">Notifications are blocked for this app. You can turn them on in your phone&apos;s settings.</p>
        ) : (
          <>
            <p className="text-[15px] leading-[22px]">
              <b>Get a notification when the club posts</b>, instead of finding out on Friday.
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
