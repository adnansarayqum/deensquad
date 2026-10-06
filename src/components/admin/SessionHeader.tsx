import Link from "next/link";
import { clock, shortDay } from "@/lib/dates";
import type { Session } from "@/lib/domain";

/** Back link, headline and the session's details, for a session's Edit, Cancel and Delete pages. */
export function SessionHeader({ session, heading }: { session: Session; heading: string }) {
  return (
    <>
      <Link href="/admin/sessions" className="inline-flex min-h-12 items-center self-start text-sm font-bold text-grass-text">
        ← Sessions
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">{heading}</h1>
        <p className="text-[15px] text-ink-muted">
          {shortDay(session.startsAt)} · {clock(session.startsAt)}–{clock(session.endsAt)} · {session.venue} · {session.ageGroups.join(", ")}
        </p>
      </div>
    </>
  );
}
