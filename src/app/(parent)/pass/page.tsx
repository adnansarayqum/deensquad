import type { Metadata } from "next";
import { Sun } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { CheckedIn } from "@/components/CheckedIn";
import { PassCacheWriter } from "@/components/PassCacheWriter";
import { PassCarousel } from "@/components/PassCarousel";
import { getPassPage } from "@/lib/parent/load";
import { cachedPasses, passCards } from "@/lib/pass/cards";

export const metadata: Metadata = { title: "Attendance QR code" };

export default async function PassPage() {
  const { user, family, checkedIn } = await getPassPage();
  const cards = await passCards(family.children);
  const several = cards.length > 1;

  return (
    <>
      <BackHeader back="/friday" backLabel="Friday" title={several ? "Attendance QR codes" : "Attendance QR code"}>
        {several
          ? "Show the QR code for each child who's here. Swipe to the next child."
          : `Show this to the coach when you arrive to check ${cards[0]?.firstName ?? "your child"} in.`}
      </BackHeader>
      <PassCacheWriter user={user.id} passes={cachedPasses(cards)} />
      <main className="flex flex-col items-center gap-4 px-4 pt-5 pb-4">
        {cards.length === 0 ? (
          <p className="rounded-app border-2 border-line bg-paper p-4 text-[15px]">No players are linked to your email yet. Ask the club to add your child.</p>
        ) : (
          <>
            {checkedIn.length > 0 ? (
              <div className="flex w-full flex-col gap-2">
                {checkedIn.map(({ child, at }) => (
                  <CheckedIn key={child.id} name={child.firstName} at={at} />
                ))}
              </div>
            ) : null}
            <PassCarousel cards={cards} />
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Sun aria-hidden size={18} />
              Turn your screen brightness up so it scans first time.
            </p>
            <p className="text-center text-sm leading-5 text-ink-muted">
              Each QR code stays the same every week. This phone keeps a copy for when there&apos;s no signal, or you can take a screenshot.
            </p>
          </>
        )}
      </main>
    </>
  );
}
