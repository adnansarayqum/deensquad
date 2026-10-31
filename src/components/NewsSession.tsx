import { CalendarCheck, CalendarX } from "lucide-react";
import { AllComing } from "./AllComing";
import { AvailabilityPicker } from "./AvailabilityPicker";
import { clock, dayHeading, shortDay } from "@/lib/dates";
import type { Family, NewsSession } from "@/lib/parent/data";
import { answeredLine, availabilityQuestion } from "@/lib/parent/views";

/**
 * What a session notice's session is now, said by the session itself rather than by whichever post a parent reads
 * first: "Now: cancelled" or "Now: going ahead, This Friday, 6 Nov · 6:30pm". Nothing once the session is over.
 */
export function SessionNow({ session, now }: { session: NewsSession; now: Date }) {
  if (session.finished) return null;
  const when = `${dayHeading(session.startsAt, now)} · ${clock(session.startsAt)}`;
  return session.cancelled ? (
    <p role="status" className="flex items-center gap-2 rounded-app bg-orange-tint px-3.5 py-2.5 text-[16px] font-bold text-ink">
      <CalendarX aria-hidden size={20} className="shrink-0 text-kit-orange" />
      <span>
        Now: {session.title} is cancelled ({dayHeading(session.startsAt, now)})
      </span>
    </p>
  ) : (
    <p role="status" className="flex items-center gap-2 rounded-app bg-grass-tint px-3.5 py-2.5 text-[16px] font-bold text-grass-text">
      <CalendarCheck aria-hidden size={20} className="shrink-0" />
      <span>
        Now: going ahead, {when}
      </span>
    </p>
  );
}

/** True when a "Who's coming?" post can still be answered here by this family. */
export function canAnswerComing(session: NewsSession | null): session is NewsSession {
  return Boolean(session && session.notice === "attendance" && !session.cancelled && !session.finished && session.children.length);
}

/** Coming / Not coming for each of the family's children on a "Who's coming?" post (the same answer as on Sessions). */
export function ComingOnNews({ session, family, now }: { session: NewsSession; family: Family; now: Date }) {
  const kids = session.children.flatMap((id) => {
    const child = family.children.find((c) => c.id === id);
    return child ? [child] : [];
  });
  const notYet = kids.filter((c) => session.answers[c.id]?.answer !== "coming");
  return (
    <div className="flex flex-col gap-3">
      {!session.squad && notYet.length > 1 ? <AllComing sessionId={session.id} kids={notYet} /> : null}
      {kids.map((c) => {
        const record = session.answers[c.id];
        return (
          <div key={c.id} className="flex flex-col gap-2">
            {kids.length > 1 ? <p className="text-[17px] font-extrabold">{c.firstName}</p> : null}
            <AvailabilityPicker
              sessionId={session.id}
              playerId={c.id}
              answer={record?.answer}
              childName={c.firstName}
              question={session.squad ? `Can ${c.firstName} play in ${session.title} on ${shortDay(session.startsAt)}?` : availabilityQuestion(c.firstName, { title: session.title, squad: undefined }, shortDay(session.startsAt))}
              squad={session.squad}
              answered={record ? answeredLine(record, family.guardian.id, now, session.squad) : undefined}
              reason={record?.reason ?? null}
              compact
              quiet
            />
          </div>
        );
      })}
    </div>
  );
}
