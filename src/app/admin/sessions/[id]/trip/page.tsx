import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FoldCard, PageHeader, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { deleteTripAction, saveTripAction } from "@/lib/trips/actions";
import { loadTripPage, poundsFromPence, type RosterChild } from "@/lib/trips/data";

export const metadata: Metadata = { title: "Away trip" };

/** "2026-11-07T09:30" in London, for a datetime-local box. */
const localValue = (isoText: string | null) =>
  isoText ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" }).format(new Date(isoText)).replace(" ", "T") : "";

// A session's away trip (matches and tournaments): where and when to meet, travel, back by, cost; and who's cleared
// to travel. Admins for any session; a group coach for sessions whose groups are all theirs (404 otherwise).
export default async function TripPage({ params }: PageProps<"/admin/sessions/[id]/trip">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const view = await asUser(user.id, (tx) => loadTripPage(tx, id, coachLimit(user.staff)));
  if (!view) notFound();
  const { session, trip, roster } = view;
  const yes = roster.filter((c) => c.answer?.consent === true);
  const no = roster.filter((c) => c.answer?.consent === false);
  const none = roster.filter((c) => !c.answer);

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: "/admin/sessions", label: "Sessions" }}
        title={`${session.title}: away trip`}
        subtitle={`${shortDay(session.startsAt)} · ${clock(session.startsAt)} · ${session.venue} · ${session.ageGroups.join(", ")}`}
      >
        {trip ? (
          <p className="text-[15px] font-bold">
            {yes.length} cleared to travel · {no.length} not going · {none.length} not answered
          </p>
        ) : null}
      </PageHeader>

      <FoldCard id="trip-details" title={trip ? "Trip details" : "Add the trip details"} open={!trip}>
        <StatefulForm action={saveTripAction} submitLabel={trip ? "Save changes" : "Save and ask the parents"} savedMessage="Saved.">
          <input type="hidden" name="session" value={session.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="meetAt" className="field-label">
                Meet at
              </label>
              <input id="meetAt" name="meetAt" type="datetime-local" required defaultValue={localValue(trip?.meetAt ?? null)} className="field" />
            </div>
            <div>
              <label htmlFor="returnAt" className="field-label">
                Back by <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input id="returnAt" name="returnAt" type="datetime-local" defaultValue={localValue(trip?.returnAt ?? null)} className="field" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="meetPoint" className="field-label">
                Where to meet
              </label>
              <input id="meetPoint" name="meetPoint" required maxLength={200} defaultValue={trip?.meetPoint ?? ""} placeholder="Bobby Moore Sports Hub car park" className="field" />
            </div>
            <div>
              <label htmlFor="transport" className="field-label">
                How they&apos;ll travel <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input id="transport" name="transport" maxLength={200} defaultValue={trip?.transport ?? ""} placeholder="Minibus with Coach Hamza" className="field" />
            </div>
            <div>
              <label htmlFor="cost" className="field-label">
                Cost in £ <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input id="cost" name="cost" inputMode="decimal" defaultValue={trip?.costPence ? (trip.costPence / 100).toFixed(2).replace(/\.00$/, "") : ""} className="field" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="notes" className="field-label">
                What to bring and anything else <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <textarea id="notes" name="notes" rows={3} maxLength={1000} defaultValue={trip?.notes ?? ""} className="field" />
            </div>
          </div>
        </StatefulForm>
        {trip ? (
          <details className="mt-3 border-t border-line pt-1">
            <summary className="inline-flex min-h-12 cursor-pointer items-center text-sm font-bold text-ink-muted underline underline-offset-4">Remove the trip</summary>
            <form action={deleteTripAction} className="flex flex-col items-start gap-2">
              <input type="hidden" name="session" value={session.id} />
              <p className="text-sm">Every parent&apos;s answer goes with it.</p>
              <label className="flex min-h-12 items-center gap-2 text-sm font-bold">
                <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 accent-[var(--kit-orange)]" />
                Yes, remove this trip
              </label>
              <button type="submit" className="btn-chunky btn-paper btn-small">
                Remove the trip
              </button>
            </form>
          </details>
        ) : null}
      </FoldCard>

      {trip ? (
        <>
          <RosterList id="not-answered" title={`Not answered (${none.length})`} list={none} />
          <RosterList id="cleared" title={`Cleared to travel (${yes.length})`} list={yes} />
          <RosterList id="not-going" title={`Not going (${no.length})`} list={no} />
        </>
      ) : (
        <p className="text-[15px] text-ink-muted">Once you save the details, each child&apos;s parents can say yes or no in the app.</p>
      )}
      {trip?.costPence ? <p className="text-sm text-ink-muted">Parents see the cost ({poundsFromPence(trip.costPence)}); collect it as you usually do.</p> : null}
    </div>
  );
}

function RosterList({ id, title, list }: { id: string; title: string; list: RosterChild[] }) {
  return (
    <Section title={title}>
      <div id={id} className="-mt-3" />
      {list.length === 0 ? (
        <p className="text-[15px] text-ink-muted">Nobody.</p>
      ) : (
        <ul className="flex flex-col">
          {list.map((c) => {
            const phone = c.answer?.dayPhone ?? c.parentPhone;
            return (
              <li key={c.id} className="flex flex-col gap-0.5 border-t border-line py-2.5 first:border-t-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold">
                    {c.firstName} {c.lastName}
                  </span>
                  <Pill tone="neutral">{c.group}</Pill>
                  {c.answer?.consent === true ? <Pill tone="done">Cleared</Pill> : null}
                </span>
                {c.answer ? (
                  <span className="text-[13px] text-ink-muted">
                    {c.answer.answeredBy ? `Answered by ${c.answer.answeredBy}, ` : ""}
                    {shortDay(c.answer.answeredAt)}
                  </span>
                ) : null}
                {c.answer?.consent && phone ? <span className="text-[13px]">On the day: {phone}</span> : null}
                {c.answer?.note ? <span className="text-[13px]">Note: {c.answer.note}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
