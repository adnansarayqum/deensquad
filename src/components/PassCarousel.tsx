"use client";

import { useRef, useState } from "react";
import { groupPlural } from "@/lib/domain";
import { QR_IMG_CLASS } from "@/lib/qr-picture";
import { ChildAvatar } from "./ChildAvatar";

export type PassCard = { id: string; firstName: string; ageGroup: string; src: string; photoFileId?: string | null };

/**
 * One QR pass per child. With two or more: tap a child's name (buttons, so a keyboard or switch control reaches every
 * child too); swiping still works, and the scroller itself can take focus and moves with the arrow keys. Which child is on screen is announced: "Musa's QR code, 2 of 2".
 */
export function PassCarousel({ cards }: { cards: PassCard[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const several = cards.length > 1;
  const label = (i: number) => `${cards[i].firstName}'s QR code${several ? `, ${i + 1} of ${cards.length}` : ""}`;

  const goTo = (i: number) => {
    const next = (i + cards.length) % cards.length;
    track.current?.children[next]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setIndex(next);
  };

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3">
      {several ? (
        <div role="group" aria-label="Choose a child" className="flex flex-wrap justify-center gap-2">
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={i === index}
              onClick={() => goTo(i)}
              className={`inline-flex min-h-12 items-center rounded-pill px-4 text-[15px] font-bold ${
                i === index ? "bg-pitch text-on-pitch" : "bg-fill text-ink"
              }`}
            >
              {c.firstName}
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== index && i >= 0 && i < cards.length) setIndex(i);
        }}
        onKeyDown={(e) => {
          if (!several) return;
          if (e.key === "ArrowRight") goTo(index + 1);
          else if (e.key === "ArrowLeft") goTo(index - 1);
          else return;
          e.preventDefault();
        }}
        tabIndex={several ? 0 : undefined}
        className="flex w-full snap-x snap-mandatory overflow-x-auto rounded-app [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-grass [&::-webkit-scrollbar]:hidden"
        aria-label={several ? "Attendance QR codes. Choose a child above, or use the arrow keys." : "Attendance QR code"}
        role="region"
      >
        {cards.map((c, i) => (
          <section key={c.id} aria-label={label(i)} className="flex w-full min-w-0 shrink-0 snap-center justify-center px-1">
            {/* A wallet-style pass: the club's dark card with the child's name, and the code on white below. */}
            <div className="relative flex w-full max-w-[340px] flex-col overflow-hidden rounded-[24px] bg-pitch-deep text-on-pitch shadow-card">
              <div aria-hidden className="stripes-v absolute inset-x-0 top-0 h-32 opacity-70" />
              <div className="relative flex items-center gap-2.5 px-4 pt-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- the crest from public/, tiny */}
                <img src="/crest.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[8px] bg-on-pitch" />
                <span className="text-[13px] font-bold text-on-pitch-muted">Deen Squad</span>
                <span className="ml-auto rounded-pill bg-floodlight px-2.5 py-0.5 text-[12px] font-bold text-on-gold">Attendance</span>
              </div>
              <div className="relative flex items-center gap-3 px-4 pt-4 pb-4">
                {c.photoFileId ? <ChildAvatar photoId={c.photoFileId} firstName={c.firstName} size={72} className="border-2 border-on-pitch/30" /> : null}
                <div className="flex min-w-0 flex-col">
                  <h2 className="font-display text-[36px] leading-none tracking-[0.02em] break-words">{c.firstName}</h2>
                  <p className="text-[14px] font-bold text-floodlight">{groupPlural(c.ageGroup)}</p>
                </div>
              </div>
              <div className="relative mx-3 mb-3 rounded-[18px] bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a small PNG data URL drawn on the server */}
                <img src={c.src} alt={`QR code that checks ${c.firstName} in`} className={QR_IMG_CLASS} />
              </div>
            </div>
          </section>
        ))}
      </div>
      {several ? (
        <>
          <p aria-live="polite" className="sr-only">
            {label(index)}
          </p>
        </>
      ) : null}
    </div>
  );
}
