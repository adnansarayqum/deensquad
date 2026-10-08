import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppHeader } from "@/components/ui";

/** Header for a step inside the checklist: back link, title, one line of context. */
export function BackHeader({ back, backLabel, title, children }: { back: string; backLabel: string; title: string; children?: ReactNode }) {
  return (
    <AppHeader>
      <Link href={back} className="inline-flex min-h-12 items-center gap-1 self-start text-sm font-bold text-on-pitch-muted">
        <ChevronLeft aria-hidden size={18} />
        {backLabel}
      </Link>
      <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">{title}</h1>
      {children ? <p className="text-sm text-on-pitch-muted">{children}</p> : null}
    </AppHeader>
  );
}
