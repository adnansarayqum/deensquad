"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/report";

// Shown when a page or action fails (a server fault, or no signal mid-tap). No error details reach the screen:
// in production Next.js hides server messages anyway, and the digest lets the club match the server log.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-start justify-center gap-4 bg-pitch-deep px-6 text-on-pitch">
      <p className="text-label text-crest-gold uppercase">Stoppage time</p>
      <h1 className="font-display text-[56px] leading-[0.9] text-floodlight">Something went wrong</h1>
      <p className="text-[15px] text-on-pitch-muted">
        That didn&apos;t go through. Check your signal and try again. Anything you&apos;d already saved is safe.
      </p>
      <button type="button" onClick={() => retry()} className="btn-chunky btn-grass">
        Try again
      </button>
      <Link href="/" className="inline-flex min-h-12 items-center text-sm font-bold text-floodlight underline">
        Back to the start
      </Link>
      {error.digest ? <p className="text-[13px] text-on-pitch-muted">If it keeps happening, tell the club this code: {error.digest}</p> : null}
    </main>
  );
}
