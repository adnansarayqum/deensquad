"use client";

import { useEffect } from "react";

// Marks a post as seen once its headline has been on screen for a moment (the club's Seen figure: parents who saw a
// post, whether or not they tapped "I've read this"). Each post is sent once per page; a failed send is dropped.
// The posts carry `data-seen="<id>"` on a mark beside their headline.

const ON_SCREEN_MS = 1000;

export function SeenTracker() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sent = new Set<string>();
    const waiting = new Map<string, number>();
    let queued: string[] = [];
    let flush = 0;
    const post = () => {
      flush = 0;
      const ids = queued;
      queued = [];
      if (!ids.length) return;
      fetch("/api/news/seen", { method: "POST", body: JSON.stringify({ ids }), headers: { "Content-Type": "application/json" }, credentials: "same-origin", keepalive: true }).catch(() => {});
    };
    const seen = (id: string) => {
      if (sent.has(id)) return;
      sent.add(id);
      queued.push(id);
      if (!flush) flush = window.setTimeout(post, 1500);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.seen;
          if (!id) continue;
          if (e.isIntersecting) {
            if (!waiting.has(id)) waiting.set(id, window.setTimeout(() => seen(id), ON_SCREEN_MS));
          } else {
            clearTimeout(waiting.get(id));
            waiting.delete(id);
          }
        }
      },
      { threshold: 1 },
    );
    document.querySelectorAll<HTMLElement>("[data-seen]").forEach((el) => io.observe(el));
    const onHide = () => document.visibilityState === "hidden" && post();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      io.disconnect();
      waiting.forEach((t) => clearTimeout(t));
      document.removeEventListener("visibilitychange", onHide);
      if (flush) clearTimeout(flush);
      post();
    };
  }, []);
  return null;
}
