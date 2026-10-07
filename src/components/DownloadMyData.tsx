"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { downloadName } from "@/lib/parent/download-name";

const TOO_MANY = "You've downloaded this a lot in the last hour. Try again later.";
const FAILED = "That didn't download. Check your signal and try again.";

/**
 * "Download my data" (Player → Your data). A plain link to /api/me/export, so it still works without JavaScript; with
 * it, the file is fetched first, so a refusal (too many in an hour, signed out) is said on the screen instead of being
 * saved as a file of error text.
 */
export function DownloadMyData() {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const download = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/me/export", { redirect: "manual", cache: "no-store" });
      if (res.status === 401 || res.type === "opaqueredirect") {
        router.push("/sign-in?next=%2Fplayer");
        return;
      }
      if (res.status === 429) return setProblem(TOO_MANY);
      if (!res.ok) return setProblem(FAILED);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName(res.headers.get("Content-Disposition"));
      document.body.append(a);
      a.click();
      a.remove();
      // Give the browser a moment to start saving before the file is let go.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setProblem(FAILED);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <a href="/api/me/export" download onClick={download} aria-disabled={busy || undefined} className="btn-chunky btn-paper self-start">
        <Download aria-hidden size={18} />
        Download my data
      </a>
      <p role="status" className={problem ? "rounded-app bg-orange-tint px-3.5 py-3 text-[15px] leading-[22px]" : "sr-only"}>
        {problem}
      </p>
    </>
  );
}
