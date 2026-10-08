"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { canonicalYouTube, embedUrl, thumbnailUrl, type YouTubeVideo } from "@/lib/video";

/**
 * A YouTube video on a session plan or practice sheet, click-to-play: only the thumbnail (i.ytimg.com) loads until a
 * parent taps it; then the privacy-enhanced player (youtube-nocookie.com) takes its place. Without JavaScript the card
 * is a link to YouTube. `name` is what the video is for ("Toe taps"), for the button's accessible name.
 */
export function VideoCard({ video, name, title = "Practice video" }: { video: YouTubeVideo; name: string; title?: string }) {
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const watch = canonicalYouTube(video);
  useEffect(() => {
    if (playing) frame.current?.focus();
  }, [playing]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative aspect-video w-full overflow-hidden rounded-app border-2 border-line bg-pitch">
        {playing ? (
          <iframe
            ref={frame}
            src={embedUrl(video)}
            title={title}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <a
            href={watch}
            target="_blank"
            rel="noopener"
            onClick={(e) => {
              e.preventDefault();
              setPlaying(true);
            }}
            aria-label={`Watch video: ${name}`}
            className="group absolute inset-0 flex items-end"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a plain img: no next/image remote config, no proxying through the app */}
            <img src={thumbnailUrl(video)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
            <span aria-hidden className="absolute inset-0 grid place-items-center">
              <span className="grid h-16 w-16 place-items-center rounded-pill bg-paper text-ink shadow-lip-neutral transition-transform group-active:translate-y-0.5">
                <Play size={30} fill="currentColor" className="translate-x-0.5" />
              </span>
            </span>
            <span className="relative m-2.5 rounded-pill bg-paper px-3 py-1.5 text-[15px] font-bold text-ink">Watch video</span>
          </a>
        )}
      </div>
      <a href={watch} target="_blank" rel="noopener" className="inline-flex min-h-12 items-center self-start px-1 text-[15px] font-bold text-grass-text underline">
        Open in YouTube
      </a>
    </div>
  );
}
