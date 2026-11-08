import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppHeader, TITLE } from "@/components/ui";

/**
 * Frame for the sign-in screens, in the parent screens' clean light look: crest and the club's name, a title, a line
 * under it, then the form. `back` adds a Back link above the crest, for pages reached from inside the app (the
 * privacy notice). (Until 8 Nov 2026 it still used the old pitch header's colours on the light header, so the line
 * under the title could barely be read.)
 */
export function AuthShell({ title, intro, back, children }: { title: string; intro?: ReactNode; back?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream">
      <AppHeader>
        {back ? (
          <Link href={back} className="-ml-1 inline-flex min-h-12 items-center gap-1 self-start pr-3 text-[15px] font-bold text-grass-text">
            <ChevronLeft aria-hidden size={20} />
            Back
          </Link>
        ) : null}
        <div className="flex items-center gap-3">
          <Image src="/crest.png" alt="" width={48} height={48} className="rounded-[12px]" priority />
          <p className="text-[15px] font-bold text-ink-muted">The Deen Squad Football Academy</p>
        </div>
        <h1 className={`mt-2 ${TITLE}`}>{title}</h1>
        {intro ? <p className="text-base leading-6 text-ink-muted">{intro}</p> : null}
      </AppHeader>
      <main className="flex flex-1 flex-col gap-4 px-4 pt-5 pb-[max(env(safe-area-inset-bottom),24px)]">{children}</main>
    </div>
  );
}

export function FormError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px] leading-[22px] text-ink">
      {children}
    </p>
  );
}
