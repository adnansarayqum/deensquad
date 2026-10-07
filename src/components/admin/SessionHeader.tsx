import { PageHeader } from "@/components/admin/bits";
import { clock, shortDay } from "@/lib/dates";
import type { Session } from "@/lib/domain";

/** Back link, headline and the session's details, for a session's Edit, Cancel and Delete pages. */
export function SessionHeader({ session, heading }: { session: Session; heading: string }) {
  return (
    <PageHeader
      back={{ href: "/admin/sessions", label: "Sessions" }}
      title={heading}
      subtitle={`${shortDay(session.startsAt)} · ${clock(session.startsAt)}–${clock(session.endsAt)} · ${session.venue} · ${session.ageGroups.join(", ")}`}
    />
  );
}
