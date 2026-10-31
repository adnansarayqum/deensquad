import Link from "next/link";
import { Bus, ChevronRight } from "lucide-react";
import { shortDay } from "@/lib/dates";
import type { FamilyTrip } from "@/lib/trips/data";
import { joinNames } from "@/lib/parent/views";

const orNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`);

/**
 * Away trips coming up for the family (News and Sessions). A trip still waiting for an answer is the orange
 * "needs action" card; once every child has an answer it's a quiet line saying who's going.
 */
export function TripCards({ trips, from }: { trips: FamilyTrip[]; from: string }) {
  if (trips.length === 0) return null;
  return (
    <>
      {trips.map((t) => {
        const waiting = t.children.filter((c) => !c.answer);
        const going = t.children.filter((c) => c.answer?.consent);
        const href = `/trip/${t.session.id}?from=${encodeURIComponent(from)}`;
        return waiting.length > 0 ? (
          <Link key={t.session.id} href={href} className="flex items-center gap-3 rounded-app border-2 border-kit-orange bg-orange-tint px-3.5 py-3 text-ink transition-transform active:translate-y-1">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-kit-orange text-on-orange">
              <Bus aria-hidden size={24} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">
                Away trip: {t.session.title}, {shortDay(t.session.startsAt)}
              </span>
              <span className="text-[13px] break-words">Say if {orNames(waiting.map((c) => c.firstName))} can go</span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0" />
          </Link>
        ) : (
          <Link key={t.session.id} href={href} className="flex items-center gap-3 rounded-app border border-line bg-paper px-3.5 py-3 text-ink">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-grass-tint text-grass-text">
              <Bus aria-hidden size={24} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">
                Away trip: {t.session.title}, {shortDay(t.session.startsAt)}
              </span>
              <span className="text-[13px] break-words text-ink-muted">{going.length ? `${joinNames(going.map((c) => c.firstName))} going` : "Not going"} · details and changes</span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
          </Link>
        );
      })}
    </>
  );
}
