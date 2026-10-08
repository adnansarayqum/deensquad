import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppHeader } from "@/components/ui";

/** Frame for the coach tools (plans, practice, points): back link, title, one line of context. */
export function StaffShell({ back, backLabel, title, intro, nav, children }: { back: string; backLabel: string; title: string; intro?: ReactNode; nav?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream pb-[max(env(safe-area-inset-bottom),24px)]">
      <AppHeader>
        <Link href={back} className="inline-flex min-h-12 items-center gap-1 self-start text-sm font-bold text-on-pitch-muted">
          <ChevronLeft aria-hidden size={18} />
          {backLabel}
        </Link>
        <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">{title}</h1>
        {intro ? <p className="text-sm text-on-pitch-muted">{intro}</p> : null}
        {nav}
      </AppHeader>
      <main className="flex flex-col gap-3 px-4 pt-4">{children}</main>
    </div>
  );
}
