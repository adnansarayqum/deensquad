"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { takeViewerOpened } from "@/lib/viewer-marker";

/**
 * Back from the file viewer. Opened by tapping an attachment in the app, it steps back to that screen
 * (keeping its scroll place); opened any other way (a fresh tab, a shared link, a reload), it goes to
 * `href`, the screen it was opened from or the person's home screen, replacing the viewer in history.
 */
export function ViewerBack({ href }: { href: string }) {
  const router = useRouter();
  const fromApp = useRef(false);
  useEffect(() => {
    // Only ever set to true: React may run this twice in development, and the second run finds the marker gone.
    if (takeViewerOpened(window.location.pathname + window.location.search)) fromApp.current = true;
  }, []);
  return (
    <Link
      href={href}
      replace
      onClick={(e) => {
        if (fromApp.current) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex min-h-12 items-center gap-1 pr-3 text-[15px] font-bold text-on-pitch"
    >
      <ChevronLeft aria-hidden size={20} />
      Back
    </Link>
  );
}
