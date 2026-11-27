import type { ReactNode } from "react";

/** A friendly empty screen or card: the crest, softened, a line saying what will show here, and an optional action. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- the crest from public/, decorative */}
      <img src="/crest.png" alt="" width={56} height={56} className="h-14 w-14 rounded-web opacity-80 grayscale-[30%]" />
      <p className="max-w-[28ch] text-small leading-[22px] text-ink-muted">{children}</p>
      {action}
    </div>
  );
}
