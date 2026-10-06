"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Product photo over a neutral placeholder (the crest on the mowing stripes). The placeholder shows when the club
 * hasn't added a photo, and when one fails to load: the photo hides itself, and a broken one has no alt text to
 * spill over the card (the product's name is right beside it).
 */
export function ProductImage({ src, large = false }: { src: string | null; /** Shown beside the image, so the image itself is decorative. */ name: string; large?: boolean }) {
  const size = large ? "aspect-[4/3]" : "aspect-square";
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A photo that failed before the page was interactive has already fired its error event.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);

  return (
    <span className={`stripes-v-tight ${size} relative grid w-full place-items-center overflow-hidden`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the club's own crest */}
      <img src="/crest.png" alt="" width={large ? 96 : 64} height={large ? 96 : 64} className="rounded-[14px] opacity-90" />
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- photos are stored in the app
        <img
          ref={img}
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full bg-cream object-cover"
          loading="lazy"
        />
      ) : null}
    </span>
  );
}
