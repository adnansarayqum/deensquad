import { FileText, ImageIcon } from "lucide-react";
import { fileLabel, type FileRef } from "@/lib/files";

/** A link that opens an attached PDF or photo in a new tab. */
export function Attachment({ file, label }: { file: FileRef; label?: string }) {
  const Icon = file.mime === "application/pdf" ? FileText : ImageIcon;
  return (
    <a
      href={`/api/files/${file.id}`}
      target="_blank"
      rel="noopener"
      className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-line bg-paper px-3 py-2 transition-transform active:translate-y-0.5"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-grass-tint text-grass-text">
        <Icon aria-hidden size={20} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-bold">{label ?? file.name}</span>
        <span className="text-[13px] text-ink-muted">{fileLabel(file)} · opens in a new tab</span>
      </span>
    </a>
  );
}
