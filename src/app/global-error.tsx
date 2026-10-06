"use client"; // Error boundaries must be Client Components

import "@fontsource/bebas-neue/400.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import "./globals.css";
import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/report";

// Shown only when the root layout itself fails, in place of the whole page (so it brings its own <html>,
// styles and fonts). Same look and words as src/app/error.tsx; a plain link back, since the app shell is gone.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error);
  }, [error]);

  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full bg-cream text-ink">
        <title>Something went wrong · Deen Squad</title>
        <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-start justify-center gap-4 bg-pitch-deep px-6 text-on-pitch">
          <p className="text-label text-crest-gold uppercase">Stoppage time</p>
          <h1 className="font-display text-[56px] leading-[0.9] text-floodlight">Something went wrong</h1>
          <p className="text-[15px] text-on-pitch-muted">
            That didn&apos;t go through. Check your signal and try again. Anything you&apos;d already saved is safe.
          </p>
          <button type="button" onClick={() => retry()} className="btn-chunky btn-grass">
            Try again
          </button>
          {/* A full page load: the app's own navigation isn't there when the root layout has failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="inline-flex min-h-12 items-center text-sm font-bold text-floodlight underline">
            Back to the start
          </a>
          {error.digest ? <p className="text-[13px] text-on-pitch-muted">If it keeps happening, tell the club this code: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
