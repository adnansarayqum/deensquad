"use client";

import { useEffect } from "react";

// Tells the club's App use page that a parent opened the app or came back to it, and how long it was on screen
// (the screen time goes into the club's day total only, never against a name). An installed app is often resumed,
// not reloaded, so a return after BACK_AFTER counts as another open. Nothing is sent while offline; a failed send is
// dropped (these are figures, not anything the parent did).

const BACK_AFTER = 30 * 60_000;
const KEY = "ds-app-open";

function send(body: object) {
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.("/api/app-use", new Blob([data], { type: "application/json" }))) return;
  } catch {}
  fetch("/api/app-use", { method: "POST", body: data, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "same-origin" }).catch(() => {});
}

function lastOpen(): number {
  try {
    return Number(sessionStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

function noteOpen(at: number) {
  try {
    sessionStorage.setItem(KEY, String(at));
  } catch {}
}

export function AppUseBeacon() {
  useEffect(() => {
    let shownAt = document.visibilityState === "visible" ? Date.now() : 0;
    let hiddenAt = 0;
    const open = () => {
      const now = Date.now();
      if (now - lastOpen() < BACK_AFTER) return;
      noteOpen(now);
      send({ event: "open" });
    };
    if (shownAt) open();
    const onChange = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        if (shownAt) send({ event: "leave", seconds: Math.round((now - shownAt) / 1000) });
        shownAt = 0;
        hiddenAt = now;
      } else if (!shownAt) {
        shownAt = now;
        if (!hiddenAt || now - hiddenAt >= BACK_AFTER) open();
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return null;
}
