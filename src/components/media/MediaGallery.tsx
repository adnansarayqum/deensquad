"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import type { MediaItem } from "@/lib/media/data";
import { durationText } from "@/lib/media/limits";

// Pictures and videos on a news post, a session or a message. One picture fills the width; one video plays where it
// is (nothing downloads until play is tapped); several make a grid of up to four (the fourth says "+3") that opens a
// full-screen viewer with Previous / Next, arrow keys and swiping. Without JavaScript each tile is a plain link.

const src = (m: MediaItem) => `/api/media/${m.id}`;
const poster = (m: MediaItem) => (m.poster ? `/api/media/${m.id}?poster=1` : undefined);

/** Width / height, kept between a tall phone portrait (4:5 shown) and a wide shot. */
function ratio(m: MediaItem): string {
  if (!m.width || !m.height) return "4 / 3";
  const r = Math.min(2, Math.max(0.8, m.width / m.height));
  return `${r}`;
}

export function MediaGallery({ items, label, compact = false }: { items: MediaItem[]; label: string; compact?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return null;
  const name = (m: MediaItem, i: number) => `${label}: ${m.kind === "video" ? "video" : "photo"} ${i + 1} of ${items.length}`;
  const max = compact ? "max-w-[320px]" : "";

  const single = items.length === 1 ? items[0] : null;
  if (single?.kind === "video") {
    return (
      <video
        controls
        playsInline
        preload="none"
        poster={poster(single)}
        src={src(single)}
        aria-label={name(single, 0)}
        className={`w-full rounded-dash bg-pitch-deep ${max}`}
        style={{ aspectRatio: ratio(single) }}
      />
    );
  }

  const shown = items.slice(0, 4);
  const more = items.length - shown.length;
  return (
    <>
      <ul className={`grid gap-1 overflow-hidden rounded-dash ${single ? "" : "grid-cols-2"} ${max}`} aria-label={`${label}: ${items.length === 1 ? "photo" : `${items.length} photos and videos`}`}>
        {shown.map((m, i) => (
          <li key={m.id} className={`relative ${single ? "" : "aspect-square"} ${!single && shown.length === 3 && i === 0 ? "row-span-2 aspect-auto" : ""}`}>
            <a
              href={src(m)}
              onClick={(e) => {
                e.preventDefault();
                setOpen(i);
              }}
              className="block h-full w-full bg-cream"
              aria-label={i === 3 && more ? `${name(m, i)}, and ${more} more` : name(m, i)}
              style={single ? ({ aspectRatio: ratio(m) } as CSSProperties) : undefined}
            >
              {m.kind === "image" || m.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.kind === "image" ? src(m) : poster(m)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <span className="block h-full w-full bg-pitch-deep" />
              )}
              {m.kind === "video" ? (
                <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-pitch-deep/85 text-on-pitch">
                    <Play size={22} />
                  </span>
                  {durationText(m.duration) ? <span className="rounded-pill bg-paper px-2 text-[13px] font-bold text-ink">{durationText(m.duration)}</span> : null}
                </span>
              ) : null}
              {i === 3 && more ? (
                <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-pitch-deep/70 font-display text-[36px] text-on-pitch">
                  +{more}
                </span>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
      {open !== null ? <Viewer items={items} start={open} label={label} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Viewer({ items, start, label, onClose }: { items: MediaItem[]; start: number; label: string; onClose: () => void }) {
  const [at, setAt] = useState(start);
  const dialog = useRef<HTMLDialogElement>(null);
  const touch = useRef<number | null>(null);
  const m = items[at];
  const many = items.length > 1;
  const go = (d: number) => setAt((i) => (i + d + items.length) % items.length);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    // The page behind keeps its place; focus goes back where it was when the viewer closes.
    const was = document.activeElement as HTMLElement | null;
    return () => was?.focus?.();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x = e.changedTouches[0]?.clientX;
        if (many && touch.current !== null && x !== undefined && Math.abs(x - touch.current) > 50) go(x < touch.current ? 1 : -1);
        touch.current = null;
      }}
      aria-label={label}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-pitch-deep p-0 text-on-pitch backdrop:bg-pitch-deep"
    >
      <div className="flex h-full flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <p aria-live="polite" className="px-2 text-[15px] font-bold">
            {many ? `${at + 1} of ${items.length}` : ""}
          </p>
          <button type="button" onClick={() => dialog.current?.close()} className="flex h-12 min-w-12 items-center justify-center gap-1 rounded-pill px-3 text-[15px] font-bold" autoFocus>
            <X aria-hidden size={22} />
            Close
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-2">
          {m.kind === "video" ? (
            <video key={m.id} controls playsInline autoPlay poster={poster(m)} src={src(m)} aria-label={`${label}: video ${at + 1} of ${items.length}`} className="max-h-full max-w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.id} src={src(m)} alt={`${label}: photo ${at + 1} of ${items.length}`} className="max-h-full max-w-full object-contain" />
          )}
        </div>
        {many ? (
          <div className="flex justify-between gap-2 px-2 py-2">
            <button type="button" onClick={() => go(-1)} className="flex h-12 items-center gap-1 rounded-pill px-3 text-[15px] font-bold">
              <ChevronLeft aria-hidden size={22} />
              Previous
            </button>
            <button type="button" onClick={() => go(1)} className="flex h-12 items-center gap-1 rounded-pill px-3 text-[15px] font-bold">
              Next
              <ChevronRight aria-hidden size={22} />
            </button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
