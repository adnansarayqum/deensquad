import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { clock, longDay, shortDay } from "@/lib/dates";
import { getFamily } from "@/lib/parent/load";
import { backTarget } from "@/lib/parent/tabs";
import { giveTripConsentAction } from "@/lib/trips/actions";
import { loadFamilyTrips, poundsFromPence } from "@/lib/trips/data";

export const metadata: Metadata = { title: "Away trip" };

/** One away trip for the family: the details, and yes or no for each of their children going. */
export default async function ParentTripPage({ params, searchParams }: PageProps<"/trip/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const back = backTarget((await searchParams).from, { href: "/friday", label: "Sessions" });
  const { user, family } = await getFamily();
  const [trips, [me]] = await asUser(user.id, async (tx) => [
    await loadFamilyTrips(tx, family.children.map((c) => c.id), new Date()),
    await tx.query<{ phone: string | null }>(`select phone from guardians where id = my_guardian_id()`),
  ] as const);
  const found = trips.find((t) => t.session.id === id);
  if (!found) notFound();
  const { trip, session, children } = found;
  const details: [string, string][] = [
    ["Meet", `${longDay(trip.meetAt)}, ${clock(trip.meetAt)} at ${trip.meetPoint}`],
    ...(trip.returnAt ? ([["Back by", `${shortDay(trip.returnAt) === shortDay(trip.meetAt) ? "" : `${shortDay(trip.returnAt)}, `}${clock(trip.returnAt)}`]] as [string, string][]) : []),
    ...(trip.transport ? ([["Travel", trip.transport]] as [string, string][]) : []),
    ...(trip.costPence ? ([["Cost", poundsFromPence(trip.costPence)]] as [string, string][]) : []),
    ["Playing at", session.venue],
  ];

  return (
    <>
      <BackHeader back={back.href} backLabel={back.label} title={`Away trip: ${session.title}`}>
        {longDay(session.startsAt)}
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-5 pb-4">
        <section className="rounded-app border border-line bg-paper p-4" aria-labelledby="trip-details">
          <h2 id="trip-details" className="text-[18px] font-bold">
            The trip
          </h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[15px]">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-bold">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
          </dl>
          {trip.notes ? <p className="mt-3 text-[15px] whitespace-pre-line">{trip.notes}</p> : null}
        </section>

        {children.map((c) => (
          <section key={c.id} className="flex flex-col gap-3 rounded-app border border-line bg-paper p-4" aria-labelledby={`child-${c.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`child-${c.id}`} className="text-[18px] font-bold">
                Can {c.firstName} go?
              </h2>
              {c.answer ? (
                c.answer.consent ? <Pill tone="done">Yes</Pill> : <Pill tone="neutral">Not going</Pill>
              ) : (
                <Pill tone="action">Answer needed</Pill>
              )}
            </div>
            {c.answer ? (
              <p className="text-[13px] text-ink-muted">
                Answered{c.answer.answeredBy ? ` by ${c.answer.answeredBy}` : ""} on {shortDay(c.answer.answeredAt)}
                {c.answer.consent && c.answer.dayPhone ? ` · on the day: ${c.answer.dayPhone}` : ""}
              </p>
            ) : null}
            <ConsentForm sessionId={session.id} childId={c.id} name={c.firstName} phone={c.answer?.dayPhone ?? me?.phone ?? ""} note={c.answer?.note ?? ""} answered={c.answer?.consent ?? null} />
          </section>
        ))}
      </main>
    </>
  );
}

function ConsentForm({ sessionId, childId, name, phone, note, answered }: { sessionId: string; childId: string; name: string; phone: string; note: string; answered: boolean | null }) {
  return (
    <StatefulForm action={giveTripConsentAction} submitLabel={answered === null ? "Send answer" : "Change answer"} savedMessage="Sent to the coaches.">
      <input type="hidden" name="session" value={sessionId} />
      <input type="hidden" name="child" value={childId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Can {name} go on this trip?</legend>
        <label className="flex min-h-12 items-center gap-3 rounded-app border border-line px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
          <input type="radio" name="consent" value="yes" required defaultChecked={answered === true} className="h-5 w-5 accent-[var(--grass)]" />
          <span className="text-[15px] font-bold">Yes, I give permission for {name} to go</span>
        </label>
        <label className="flex min-h-12 items-center gap-3 rounded-app border border-line px-3.5 has-[:checked]:border-ink">
          <input type="radio" name="consent" value="no" defaultChecked={answered === false} className="h-5 w-5 accent-[var(--ink)]" />
          <span className="text-[15px] font-bold">No, {name} isn&apos;t going</span>
        </label>
      </fieldset>
      <div>
        <label htmlFor={`phone-${childId}`} className="field-label">
          Your mobile on the day
        </label>
        <input id={`phone-${childId}`} name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={phone} className="field" />
      </div>
      <div>
        <label htmlFor={`note-${childId}`} className="field-label">
          Anything the coaches should know <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea id={`note-${childId}`} name="note" rows={2} maxLength={300} defaultValue={note} placeholder="Travel sickness, collected by his uncle…" className="field" />
      </div>
    </StatefulForm>
  );
}
