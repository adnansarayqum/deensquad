import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/bits";
import { IncidentForm } from "@/components/incidents/IncidentForm";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { loadIncidentChildren } from "@/lib/incidents/data";

export const metadata: Metadata = { title: "Log an accident or incident" };

/** "2026-10-23T18:45" for a datetime-local box, in London time. */
function londonNow(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Opened from the register ("Log an accident or incident", with the session and maybe a child) or the incidents list. */
export default async function NewIncidentPage({ searchParams }: PageProps<"/coach/incidents/new">) {
  const user = await requireStaff();
  const params = await searchParams;
  const sessionParam = typeof params.session === "string" && UUID.test(params.session) ? params.session : null;
  const childParam = typeof params.child === "string" && UUID.test(params.child) ? params.child : null;
  const { children, session } = await asUser(user.id, async (tx) => ({
    children: await loadIncidentChildren(tx, coachLimit(user.staff)),
    session: sessionParam
      ? (await tx.query<{ id: string; title: string; starts_at: Date }>(`select id, title, starts_at from sessions where id = $1`, [sessionParam]))[0] ?? null
      : null,
  }));
  const label = session ? `${session.title}, ${shortDay(session.starts_at.toISOString())} ${clock(session.starts_at.toISOString())}` : null;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: session ? `/coach?session=${session.id}` : "/coach/incidents", label: session ? "Register" : "Accidents and incidents" }}
        title="Log an accident or incident"
        subtitle="Injuries, a child feeling unwell, behaviour, anything the parents should know."
      />
      <div className="rounded-app border border-line bg-paper p-4">
        <IncidentForm
          childList={children.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, group: c.age_group }))}
          childId={childParam && children.some((c) => c.id === childParam) ? childParam : null}
          sessionId={session?.id ?? null}
          sessionLabel={label}
          now={londonNow(new Date())}
        />
      </div>
    </div>
  );
}
