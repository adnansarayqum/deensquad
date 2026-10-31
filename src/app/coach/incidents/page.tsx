import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { INCIDENT_KINDS, loadIncidents } from "@/lib/incidents/data";

export const metadata: Metadata = { title: "Accidents and incidents" };

/** Every accident or incident logged in this member of staff's groups (admins: the club), newest first. */
export default async function IncidentsPage({ searchParams }: PageProps<"/coach/incidents">) {
  const user = await requireStaff();
  const params = await searchParams;
  const incidents = await asUser(user.id, (tx) => loadIncidents(tx, { mine: coachLimit(user.staff), limit: 100 }));
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: "/coach", label: "Register" }}
        title="Accidents and incidents"
        subtitle="Kept as club records. The parents were sent each one in the app."
        actions={
          <Link href="/coach/incidents/new" className="btn-chunky btn-grass btn-small">
            Log one
          </Link>
        }
      />
      {params.logged ? <Notice>Logged. The parents have been sent it in the app, and the admins told.</Notice> : null}
      {incidents.length === 0 ? (
        <p className="rounded-app border border-line bg-paper p-4 text-[15px] text-ink-muted">Nothing logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {incidents.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 rounded-app border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[18px] font-bold">{i.childName}</span>
                <Pill tone="neutral">{i.ageGroup}</Pill>
                <Pill tone="neutral">{INCIDENT_KINDS[i.kind]}</Pill>
              </div>
              <p className="text-sm text-ink-muted">
                {shortDay(i.happenedAt)} {clock(i.happenedAt)}
                {i.sessionTitle ? ` · ${i.sessionTitle}` : ""} · logged by {i.reportedBy}
              </p>
              <p className="text-[15px] leading-[22px] whitespace-pre-line">
                <span className="font-bold">What happened: </span>
                {i.whatHappened}
              </p>
              <p className="text-[15px] leading-[22px] whitespace-pre-line">
                <span className="font-bold">What we did: </span>
                {i.actionTaken}
              </p>
              {i.conversationId ? (
                <Link href={`/admin/messages/${i.conversationId}`} className="inline-flex min-h-12 items-center self-start text-sm font-bold text-grass-text underline">
                  Messages with the parents
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
