"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Back from the file viewer. Opened from a screen in the app, it steps back to that screen (keeping
 * its scroll place); opened on its own (a fresh tab, a shared link), it goes to `href` instead.
 */
export function ViewerBack({ href }: { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      replace
      onClick={(e) => {
        if (window.history.length > 1) {
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
