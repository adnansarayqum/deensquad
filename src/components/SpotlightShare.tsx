"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

/**
 * Share a Player of the week card from the phone's own share sheet (WhatsApp, Instagram, Messages), as a picture.
 * Where the browser can't share files (most computers), or without JavaScript, the link under it saves the picture.
 */
export function SpotlightShare({ id, firstName }: { id: string; firstName: string }) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const share = async () => {
    setState("busy");
    try {
      const res = await fetch(`/api/spotlight/${id}/card`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("card");
      const file = new File([await res.blob()], `${firstName}-player-of-the-week.png`, { type: "image/png" });
      if (!navigator.canShare?.({ files: [file] })) {
        // No share sheet for pictures here (most computers): save the picture we already have.
        const url = URL.createObjectURL(file);
        const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
        a.click();
        URL.revokeObjectURL(url);
        return setState("idle");
      }
      await navigator.share({ files: [file], title: `${firstName} is Player of the week` });
      setState("idle");
    } catch (error) {
      // Closing the share sheet isn't a failure.
      setState(error instanceof DOMException && error.name === "AbortError" ? "idle" : "failed");
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn-chunky btn-grass w-full" onClick={share} disabled={state === "busy"} aria-label={`Share ${firstName}'s Player of the week card`}>
        <Share2 aria-hidden size={18} />
        {state === "busy" ? "Getting the card…" : "Share the card"}
      </button>
      {state === "failed" ? (
        <p role="alert" className="text-[14px] text-ink">
          That didn&apos;t work. Check your signal and try again, or save the picture below.
        </p>
      ) : null}
      <a href={`/api/spotlight/${id}/card?download=1`} className="inline-flex min-h-12 items-center justify-center text-[15px] font-bold text-grass-text underline">
        Save the picture
      </a>
    </div>
  );
}
