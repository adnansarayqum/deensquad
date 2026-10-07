"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { groupPlural } from "@/lib/domain";

export type PassCard = { id: string; firstName: string; ageGroup: string; svg: string };

/**
 * One QR pass per child. With two or more: swipe sideways, tap a child's name, or use Previous child / Next child
 * (buttons, so a keyboard or switch control reaches every child too). The scroller itself can take focus and
 * moves with the arrow keys. Which child is on screen is announced: "Musa's QR code, 2 of 2".
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
              className={`inline-flex min-h-12 items-center rounded-pill border-2 px-4 text-[15px] font-extrabold ${
                i === index ? "border-grass bg-grass-tint text-grass-text" : "border-line bg-paper text-ink"
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
        aria-label={several ? "Attendance QR codes. Swipe, or use the arrow keys, to see each child." : "Attendance QR code"}
        role="region"
      >
        {cards.map((c, i) => (
          <section key={c.id} aria-label={label(i)} className="flex w-full min-w-0 shrink-0 snap-center flex-col items-center gap-3 px-2">
            <h2 className="text-center font-display text-[40px] leading-none tracking-[0.02em] break-words">
              {c.firstName} <span className="text-ink-muted">· {groupPlural(c.ageGroup)}</span>
            </h2>
            <div
              role="img"
              aria-label={`QR code that checks ${c.firstName} in`}
              className="w-full max-w-[300px] rounded-app border-2 border-line bg-white p-4 [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: c.svg }}
            />
          </section>
        ))}
      </div>
      {several ? (
        <>
          <div className="flex w-full flex-wrap justify-center gap-2">
            <button type="button" onClick={() => goTo(index - 1)} className="btn-chunky btn-paper min-h-12 px-4">
              <ChevronLeft aria-hidden size={18} />
              Previous child
            </button>
            <button type="button" onClick={() => goTo(index + 1)} className="btn-chunky btn-paper min-h-12 px-4">
              Next child
              <ChevronRight aria-hidden size={18} />
            </button>
          </div>
          <p aria-live="polite" className="sr-only">
            {label(index)}
          </p>
        </>
      ) : null}
    </div>
  );
}
