"use client";

import Link from "next/link";
import { FileText, ImageIcon } from "lucide-react";
import { fileLabel, type FileRef } from "@/lib/files";
import { viewerHref } from "@/lib/viewer";
import { markViewerOpened } from "@/lib/viewer-marker";

/**
 * A link that opens an attached PDF or photo in the app's own viewer (same window, with Back), so the
 * installed app never opens a full-screen file with no way back. `from` is the screen it's on.
 */
export function Attachment({ file, label, from }: { file: FileRef; label?: string; from: string }) {
  const Icon = file.mime === "application/pdf" ? FileText : ImageIcon;
  const href = viewerHref(file.id, from);
  return (
    <Link
      href={href}
      onClick={() => markViewerOpened(href)}
      className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line bg-paper px-3 py-2 transition-transform active:translate-y-0.5"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-grass-tint text-grass-text">
        <Icon aria-hidden size={20} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-bold">{label ?? file.name}</span>
        <span className="text-[13px] text-ink-muted">{fileLabel(file)}</span>
      </span>
    </Link>
  );
}
