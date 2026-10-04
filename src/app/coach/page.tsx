import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronLeft, QrCode } from "lucide-react";
import { CheckInButton } from "@/components/CheckInButton";
import { Progress } from "@/components/ui";
import { getRegisterView } from "@/lib/data";

export const metadata: Metadata = { title: "Coach register" };

const flagText = { no_payment_plan: "No payment plan · link sent", missing_consent: "No photo consent yet" } as const;

export default async function CoachRegisterPage() {
  const view = await getRegisterView();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date())
    .replace(" ", "")
    .toLowerCase();

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-pitch-deep text-on-pitch">
      <header className="flex items-end justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),20px)] pb-3.5">
        <div className="flex flex-col gap-0.5 pt-4">
          <Link href="/player" className="mb-1 inline-flex items-center gap-1 text-sm font-bold text-on-pitch-muted">
            <ChevronLeft aria-hidden size={18} />
            Parent view
          </Link>
          <p className="text-label text-crest-gold uppercase">Coach mode · gate check-in</p>
          <h1 className="font-display text-[44px] leading-[0.95] tracking-[0.02em]">Friday register</h1>
        </div>
        <span className="font-display text-[28px] leading-none text-floodlight">{time}</span>
      </header>

      <div className="relative mx-4 flex h-[196px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-app">
        <div aria-hidden className="stripes-v-tight absolute inset-0" />
        <div className="relative grid h-[140px] w-[140px] place-items-center rounded-[22px] border-4 border-floodlight text-floodlight">
          <QrCode aria-hidden size={64} strokeWidth={1.8} />
        </div>
        <p className="relative px-6 text-center text-sm text-on-pitch-muted">Camera scanning arrives with the live app. Use Mark here for now.</p>
      </div>

      {view.latest.map((r) => (
        <div key={r.id} className="mx-4 mt-3 flex items-center gap-3 rounded-app bg-grass-tint px-3.5 py-3 text-ink">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-grass font-display text-[22px] text-on-grass">{r.shirtNumber}</span>
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-bold">
              {r.firstName} {r.lastInitial}. checked in
            </span>
            <span className="text-[13px] text-ink-muted">
              {view.ageGroup}s · {r.checkedInAt === "now" ? "just now" : r.checkedInAt}
            </span>
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-pill bg-grass text-on-grass">
            <Check aria-hidden size={16} strokeWidth={3} />
          </span>
        </div>
      ))}

      {view.flagged.map((r) => (
        <div key={r.id} className="mx-4 mt-2.5 flex items-center gap-3 rounded-app border-2 border-kit-orange bg-orange-tint px-3.5 py-3 text-ink">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-kit-orange font-display text-[22px] text-on-orange">{r.shirtNumber}</span>
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-bold">
              {r.firstName} {r.lastInitial}. needs a word
            </span>
            <span className="text-[13px] text-ink-muted">{r.flag ? flagText[r.flag] : ""}</span>
          </span>
        </div>
      ))}

      <main className="mt-3.5 flex flex-1 flex-col gap-3 rounded-t-[24px] bg-cream px-4 pt-[18px] pb-[max(env(safe-area-inset-bottom),24px)] text-ink">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[30px] leading-none text-ink">{view.ageGroup}s</h2>
          <p className="text-sm text-ink-muted">
            <span className="font-display text-[26px] text-ink tabular-nums">{view.hereCount}</span> of {view.expectedTotal} expected
          </p>
        </div>
        <Progress value={view.hereCount} max={view.expectedTotal} label={`${view.hereCount} of ${view.expectedTotal} here`} className="w-full" />
        <p className="mt-1 text-label text-ink-muted uppercase">{view.notHere.length > 0 ? "Expected, not here yet" : "Everyone expected is here"}</p>
        <ul className="flex flex-col gap-2.5">
          {view.notHere.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-2xl border-2 border-line bg-paper py-2.5 pr-3 pl-3.5">
              <span className="text-[15px] font-bold">
                {r.firstName} {r.lastInitial}.
              </span>
              <CheckInButton playerId={r.id} name={`${r.firstName} ${r.lastInitial}.`} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
