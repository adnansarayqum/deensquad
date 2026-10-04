import type { ReactNode } from "react";
import Image from "next/image";
import { AppHeader } from "@/components/ui";

/** Frame for the sign-in screens: crest and title on the pitch, then the form. */
export function AuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-cream">
      <AppHeader stripes>
        <div className="flex items-center gap-3">
          <Image src="/crest.png" alt="" width={52} height={52} className="rounded-[12px]" priority />
          <p className="text-label text-floodlight uppercase">The Deen Squad Football Academy</p>
        </div>
        <h1 className="font-display text-[48px] leading-[0.92] tracking-[0.02em]">{title}</h1>
        {intro ? <p className="text-[15px] leading-[22px] text-on-pitch-muted">{intro}</p> : null}
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
