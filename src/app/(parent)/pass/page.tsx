import type { Metadata } from "next";
import { backTarget } from "@/lib/parent/tabs";
import { Sun } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { CheckedIn } from "@/components/CheckedIn";
import { PassCacheWriter } from "@/components/PassCacheWriter";
import { PassCarousel } from "@/components/PassCarousel";
import { KeepAwake } from "@/components/KeepAwake";
import { VenuePassCard } from "@/components/VenuePassCard";
import { getPassPage } from "@/lib/parent/load";
import { cachedPasses, passCards } from "@/lib/pass/cards";

export const metadata: Metadata = { title: "Attendance QR code" };

export default async function PassPage({ searchParams }: PageProps<"/pass">) {
  const back = backTarget((await searchParams).from, { href: "/friday", label: "Sessions" });
  const { user, family, checkedIn, venuePass } = await getPassPage();
  const cards = await passCards(family.children);
  const several = cards.length > 1;

  return (
    <>
      <BackHeader back={back.href} backLabel={back.label} title={several ? "Attendance QR codes" : "Attendance QR code"}>
        {several
          ? "Show the QR code for each child who's here. Tap a name to switch."
          : `Show this to the coach when you arrive to check ${cards[0]?.firstName ?? "your child"} in.`}
      </BackHeader>
      <PassCacheWriter user={user.id} passes={cachedPasses(cards)} hub={venuePass?.cache ?? null} />
      <main className="flex flex-col items-center gap-4 px-4 pt-5 pb-4">
        {cards.length === 0 ? (
          <p className="rounded-app bg-paper shadow-card p-4 text-[15px]">No players are linked to your email yet. Ask the club to add your child.</p>
        ) : (
          <>
            {checkedIn.length > 0 ? (
              <div className="flex w-full flex-col gap-2">
                {checkedIn.map(({ child, at }) => (
                  <CheckedIn key={child.id} name={child.firstName} at={at} />
                ))}
              </div>
            ) : null}
            <KeepAwake />
            <PassCarousel cards={cards} />
            <p className="flex items-start gap-2 text-[15px] leading-5 text-ink-muted">
              <Sun aria-hidden size={18} className="mt-0.5 shrink-0" />
              Turn your screen brightness up at the gate. The screen stays on here, and the codes work with no signal too.
            </p>
          </>
        )}
        {/* The parent's own entry code for the sports hub, under the children's: no more digging through photos at the gate. */}
        <VenuePassCard view={venuePass} />
      </main>
    </>
  );
}
