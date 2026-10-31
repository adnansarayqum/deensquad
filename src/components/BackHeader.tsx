import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppHeader, TITLE } from "@/components/ui";

/** Header for a step inside the checklist: back link, title, one line of context. */
export function BackHeader({ back, backLabel, title, children }: { back: string; backLabel: string; title: string; children?: ReactNode }) {
  return (
    <AppHeader>
      <Link href={back} className="inline-flex min-h-12 items-center gap-1 self-start text-[15px] font-bold text-grass-text">
        <ChevronLeft aria-hidden size={18} />
        {backLabel}
      </Link>
      <h1 className={`pr-36 max-[374px]:pr-28 ${TITLE}`}>{title}</h1>
      {children ? <p className="text-[15px] leading-[22px] text-ink-muted">{children}</p> : null}
    </AppHeader>
  );
}
