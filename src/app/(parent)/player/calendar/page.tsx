import type { Metadata } from "next";
import { backTarget } from "@/lib/parent/tabs";
import { BackHeader } from "@/components/BackHeader";
import { CalendarLink } from "@/components/CalendarLink";
import { loadMyCalendarLinks } from "@/lib/calendar/feed";
import { asUser } from "@/lib/db";
import { getFamily } from "@/lib/parent/load";

export const metadata: Metadata = { title: "Calendar" };

/** Player → Calendar: a private feed of the family's sessions for the phone's calendar app. */
export default async function CalendarPage({ searchParams }: PageProps<"/player/calendar">) {
  const back = backTarget((await searchParams).from, { href: "/player", label: "Family" });
  const { user } = await getFamily();
  const mine = await asUser(user.id, loadMyCalendarLinks);

  return (
    <>
      <BackHeader back={back.href} backLabel={back.label} title="Calendar">
        Your children&apos;s sessions in your phone&apos;s calendar, kept up to date, with cancellations.
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <CalendarLink hasLink={mine.count > 0} count={mine.count} />
      </main>
    </>
  );
}
