"use client";

import { useTransition } from "react";
import { acknowledgeAnnouncement } from "@/lib/parent/actions";

export function AcknowledgeButton({ announcementId }: { announcementId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-chunky btn-grass w-full"
      disabled={pending}
      onClick={() => startTransition(() => acknowledgeAnnouncement(announcementId))}
    >
      {pending ? "Saving…" : "I've read this"}
    </button>
  );
}
