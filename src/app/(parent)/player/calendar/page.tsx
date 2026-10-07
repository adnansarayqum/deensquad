import type { Metadata } from "next";
import { BackHeader } from "@/components/BackHeader";
import { CalendarLink } from "@/components/CalendarLink";
import { loadMyCalendarLink } from "@/lib/calendar/feed";
import { asUser } from "@/lib/db";
import { getFamily } from "@/lib/parent/load";

export const metadata: Metadata = { title: "Calendar" };

/** Player → Calendar: a private feed of the family's sessions for the phone's calendar app. */
export default async function CalendarPage() {
  const { user } = await getFamily();
  const madeAt = await asUser(user.id, loadMyCalendarLink);

  return (
    <>
      <BackHeader back="/player" backLabel="Back" title="Calendar">
        Your children&apos;s sessions in your phone&apos;s calendar, kept up to date, with cancellations.
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <CalendarLink hasLink={madeAt !== null} />
      </main>
    </>
  );
}
