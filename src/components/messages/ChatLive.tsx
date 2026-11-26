"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { refreshIfReachable } from "@/lib/client/register-refresh";

const EVERY_MS = 15_000;

/**
 * Keeps an open chat like a chat: it starts at the latest message (or at the conversation an old link named,
 * `#t-<id>`), follows new ones down when the reader is already at the foot, and looks for new messages every 15
 * seconds while it's on screen (only when the server answers: `refreshIfReachable`). Renders nothing.
 */
export function ChatLive({ count, lastId }: { count: number; lastId: string | null }) {
  const router = useRouter();
  const seen = useRef<string | null>(null);

  useEffect(() => {
    const first = seen.current === null;
    const atFoot = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
    if (lastId === seen.current) return;
    seen.current = lastId ?? "";
    const named = first && window.location.hash.startsWith("#t-") ? window.location.hash.slice(3) : "";
    const inThread = named ? [...document.querySelectorAll<HTMLElement>("[data-chat] [data-thread]")].filter((el) => el.dataset.thread === named).at(-1) : undefined;
    if (inThread) {
      inThread.scrollIntoView({ block: "center" });
      return;
    }
    if (first || atFoot) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: first ? "auto" : "smooth" });
  }, [count, lastId]);

  useEffect(() => {
    const look = () => {
      void refreshIfReachable(() => router.refresh());
    };
    const timer = window.setInterval(look, EVERY_MS);
    const back = () => {
      if (document.visibilityState === "visible") look();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [router]);

  return null;
}
