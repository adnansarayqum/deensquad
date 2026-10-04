"use client";

import { useRef, useState } from "react";

export type PassCard = { id: string; firstName: string; ageGroup: string; svg: string };

/** One QR pass per child; swipe sideways between them. Dots show which child is on screen. */
export function PassCarousel({ cards }: { cards: PassCard[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => track.current?.children[i]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={cards.length > 1 ? "Gate passes. Swipe to see each child." : "Gate pass"}
        role="region"
      >
        {cards.map((c, i) => (
          <section
            key={c.id}
            aria-label={`${c.firstName}'s pass${cards.length > 1 ? `, ${i + 1} of ${cards.length}` : ""}`}
            className="flex w-full shrink-0 snap-center flex-col items-center gap-3 px-2"
          >
            <h2 className="font-display text-[40px] leading-none tracking-[0.02em]">
              {c.firstName} <span className="text-ink-muted">· {c.ageGroup}s</span>
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
      {cards.length > 1 ? (
        <div className="flex items-center gap-1" role="tablist" aria-label="Choose a child">
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={c.firstName}
              onClick={() => goTo(i)}
              className="grid h-11 min-w-11 place-items-center px-1"
            >
              <span className={`block h-2.5 rounded-pill transition-all ${i === index ? "w-7 bg-grass" : "w-2.5 bg-line"}`} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
