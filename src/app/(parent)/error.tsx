"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/report";

// A parent screen that failed (a server fault, or no signal) stays inside the app: the tab bar is still there, and
// on a session day the attendance QR codes are one tap away. A plain link, not Next's router: with no signal a full
// page load of /pass is what the service worker answers with the saved codes.
export default function ParentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-4 px-4 pt-8">
      <h1 className="text-[30px] leading-9 font-bold text-ink">That didn&apos;t load</h1>
      <p className="text-[16px] text-ink">Check your signal and try again. Anything you&apos;d already saved is safe.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="btn-chunky btn-grass">
          Try again
        </button>
        {/* A full page load, so the saved codes show with no signal. */}
        <a href="/pass" className="btn-chunky btn-paper">
          Show attendance QR codes
        </a>
      </div>
      {error.digest ? <p className="text-[13px] text-ink-muted">If it keeps happening, tell the club this code: {error.digest}</p> : null}
    </div>
  );
}
