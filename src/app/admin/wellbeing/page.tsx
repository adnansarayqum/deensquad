import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { followUpCheckinAction } from "@/lib/wellbeing/actions";
import { loadAdminCheckins, MOODS, type AdminCheckin } from "@/lib/wellbeing/data";

export const metadata: Metadata = { title: "Wellbeing check-ins" };

/**
 * Admins only (the club's welfare lead): parents' check-ins about how their child is finding football. "Not great" or
 * a note comes first, to follow up; the rest of the last 30 days below. Coaches never see this page or the data.
 */
export default async function WellbeingAdminPage() {
  const user = await requireAdmin();
  const { open, recent } = await asUser(user.id, (tx) => loadAdminCheckins(tx, new Date()));
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin", label: "Overview" }} title="Wellbeing check-ins" subtitle="Only admins can see these. Coaches and other parents can't." />
      <Section title={`To look at (${open.length})`}>
        {open.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Nothing to follow up.</p>
        ) : (
          <ul className="flex flex-col">
            {open.map((c) => (
              <CheckinRow key={c.id} c={c} action />
            ))}
          </ul>
        )}
      </Section>
      <Section title="Last 30 days">
        {recent.length === 0 ? (
          <p className="text-[15px] text-ink-muted">No other check-ins.</p>
        ) : (
          <ul className="flex flex-col">
            {recent.map((c) => (
              <CheckinRow key={c.id} c={c} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function CheckinRow({ c, action = false }: { c: AdminCheckin; action?: boolean }) {
  return (
    <li className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0">
      <span className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/families/${c.playerId}`} className="text-[15px] font-bold underline">
          {c.child}
        </Link>
        <Pill tone="neutral">{c.group}</Pill>
        <Pill tone={c.mood === "low" ? "action" : c.mood === "good" ? "done" : "neutral"}>{MOODS[c.mood]}</Pill>
      </span>
      {c.note ? <p className="text-[15px] whitespace-pre-line">{c.note}</p> : null}
      <span className="text-[13px] text-ink-muted">
        {c.givenBy ? `From ${c.givenBy}, ` : ""}
        {shortDay(c.createdAt)} {clock(c.createdAt)}
        {c.followedUpAt ? ` · followed up${c.followedUpBy ? ` by ${c.followedUpBy}` : ""} ${shortDay(c.followedUpAt)}` : ""}
      </span>
      {action ? (
        <form action={followUpCheckinAction}>
          <input type="hidden" name="id" value={c.id} />
          <button type="submit" className="btn-chunky btn-paper btn-small" aria-label={`Mark ${c.child}'s check-in as followed up`}>
            Mark as followed up
          </button>
        </form>
      ) : null}
    </li>
  );
}
