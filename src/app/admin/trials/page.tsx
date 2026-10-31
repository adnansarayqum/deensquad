import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { appUrl } from "@/lib/config";
import { asUser } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { poundsText } from "@/lib/settings";
import { cancelTrialAction } from "@/lib/trials/actions";
import { loadTrials, type TrialRow } from "@/lib/trials/data";

export const metadata: Metadata = { title: "Trials" };

const status = (t: TrialRow, now: Date) =>
  t.cancelledAt ? "Cancelled" : t.arrivedAt ? "Came" : new Date(t.sessionStartsAt).getTime() < now.getTime() ? "Didn't come" : "Booked";

/** Admin → Sessions → Trials: bookings from /trial (from 30 days ago on), a group coach's groups only. */
export default async function TrialsPage({ searchParams }: PageProps<"/admin/trials">) {
  const user = await requireStaff();
  const params = await searchParams;
  const now = new Date();
  const trials = await asUser(user.id, (tx) => loadTrials(tx, now, coachLimit(user.staff)));
  const upcoming = trials.filter((t) => new Date(t.sessionStartsAt).getTime() >= now.getTime() - 3 * 3600_000);
  const past = trials.filter((t) => !upcoming.includes(t)).reverse();

  const card = (t: TrialRow) => (
    <li key={t.id} className="flex flex-col gap-2 rounded-app border-2 border-line bg-paper p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[17px] font-extrabold">{t.childName}</span>
        <Pill tone="neutral">{t.ageGroup}</Pill>
        <Pill tone={t.cancelledAt ? "neutral" : t.arrivedAt ? "done" : "neutral"}>{status(t, now)}</Pill>
        {t.paidPence ? <Pill tone="done">Paid {poundsText(t.paidPence)}</Pill> : null}
      </div>
      <p className="text-sm text-ink-muted">
        {t.sessionTitle}, {shortDay(t.sessionStartsAt)} {clock(t.sessionStartsAt)} · born {new Date(`${t.dateOfBirth}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </p>
      <p className="text-[15px]">
        {t.parentName} ·{" "}
        <a href={`mailto:${t.email}`} className="font-bold text-grass-text underline">
          {t.email}
        </a>
        {t.phone ? (
          <>
            {" · "}
            <a href={`tel:${t.phone.replace(/\s/g, "")}`} className="font-bold text-grass-text underline">
              {t.phone}
            </a>
          </>
        ) : null}
      </p>
      {!t.cancelledAt && !t.arrivedAt && new Date(t.sessionStartsAt).getTime() > now.getTime() ? (
        <form action={cancelTrialAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="trial" value={t.id} />
          <label className="flex min-h-12 items-center gap-2 text-sm">
            <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 accent-[var(--grass)]" />
            Yes, cancel {t.childName}&apos;s trial
          </label>
          <button type="submit" className="btn-chunky btn-paper btn-small min-h-12">
            Cancel booking
          </button>
        </form>
      ) : null}
    </li>
  );

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin/sessions", label: "Sessions" }} title="Trials" subtitle="Families who booked a trial session on the club's booking page." />
      {params.cancelled ? <Notice>Booking cancelled. Let the family know.</Notice> : null}
      {params.cancel === "confirm" ? <Notice tone="action">Tick the box to cancel a booking.</Notice> : null}
      <section className="flex flex-col gap-2 rounded-app border-2 border-line bg-paper p-4">
        <h2 className="text-[17px] font-extrabold">Booking page</h2>
        <p className="text-[15px] leading-[22px]">
          Share this link on the club&apos;s Instagram, WhatsApp or website. Families pick a session for their child&apos;s group and pay the session fee by card or cash
          at the gate. The child shows on that session&apos;s register under Trials.
        </p>
        <Link href="/trial" className="font-bold break-all text-grass-text underline">
          {`${appUrl() ?? ""}/trial`}
        </Link>
      </section>
      <h2 className="text-[17px] font-extrabold">Coming up ({upcoming.length})</h2>
      {upcoming.length ? <ul className="flex flex-col gap-3">{upcoming.map(card)}</ul> : <p className="text-[15px] text-ink-muted">No trials booked.</p>}
      {past.length ? (
        <details className="rounded-app border-2 border-line bg-paper p-4">
          <summary className="min-h-12 cursor-pointer py-2 text-[17px] font-extrabold">Last 30 days ({past.length})</summary>
          <ul className="mt-3 flex flex-col gap-3">{past.map(card)}</ul>
        </details>
      ) : null}
    </div>
  );
}
