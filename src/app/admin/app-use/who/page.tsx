import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/admin/bits";
import { loadOpeners, WHO_PERIODS, type Opener, type WhoPeriod } from "@/lib/app-use/data";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { AGE_GROUPS } from "@/lib/domain";
import { shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { tidyName } from "@/lib/validate";

export const metadata: Metadata = { title: "Who opened the app" };

const PERIOD_WORDS: Record<WhoPeriod, string> = { 1: "Today", 7: "Last 7 days", 30: "Last 30 days" };

/**
 * The names behind App use's "N of M parents opened it": who opened the app today, in the last 7 or 30 days, who is
 * on the app but didn't, and who has never signed in. A group coach sees their own groups' parents.
 */
export default async function WhoOpenedPage({ searchParams }: PageProps<"/admin/app-use/who">) {
  const user = await requireStaff();
  const { days: askedDays, group: askedGroup } = await searchParams;
  const allowed = coachLimit(user.staff!) ?? AGE_GROUPS;
  const group = allowed.find((g) => g === askedGroup) ?? null;
  const period = WHO_PERIODS.find((d) => String(d) === askedDays) ?? 7;
  const who = await asUser(user.id, (tx) => loadOpeners(tx, group ? [group] : allowed, period));
  const href = (d: WhoPeriod, g: string | null) => `/admin/app-use/who?days=${d}${g ? `&group=${g}` : ""}`;
  const chip = (on: boolean) =>
    `inline-flex min-h-12 items-center rounded-pill border px-4 text-small font-bold ${on ? "border-grass bg-grass-tint text-grass-text" : "border-line bg-paper text-ink"}`;
  const total = who.opened.length + who.notOpened.length + who.notOnApp.length;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: group ? `/admin/app-use?group=${group}` : "/admin/app-use", label: "App use" }}
        title="Who opened the app"
        subtitle={`${who.opened.length} of ${total} parents opened it ${period === 1 ? "today" : `in the last ${period} days`}.`}
      >
        <nav aria-label="Period" className="flex flex-wrap gap-2">
          {WHO_PERIODS.map((d) => (
            <Link key={d} href={href(d, group)} aria-current={d === period ? "page" : undefined} className={chip(d === period)}>
              {PERIOD_WORDS[d]}
            </Link>
          ))}
        </nav>
        {allowed.length > 1 ? (
          <nav aria-label="Group" className="flex flex-wrap gap-2">
            {[null, ...allowed].map((g) => (
              <Link key={g ?? "all"} href={href(period, g)} aria-current={g === group ? "page" : undefined} className={chip(g === group)}>
                {g ?? "All"}
              </Link>
            ))}
          </nav>
        ) : null}
      </PageHeader>

      <Section title={`Opened it (${who.opened.length})`}>
        <People list={who.opened} empty="Nobody yet." detail={(o) => `${period === 1 ? "" : `${o.days} ${o.days === 1 ? "day" : "days"} · `}${o.opens} ${o.opens === 1 ? "time" : "times"} · last ${shortDay(o.lastOpened!)}`} />
      </Section>

      <Section title={`On the app, but didn't open it (${who.notOpened.length})`}>
        {who.sinceStart ? <p className="mb-2 text-small text-ink-muted">The app has kept a note of who opens it since 23 November, so this means not since then.</p> : null}
        <People list={who.notOpened} empty="Every parent on the app opened it." detail={(o) => (o.lastOpened ? `Last opened ${shortDay(o.lastOpened)}` : "No open on record yet")} />
      </Section>

      <Section title={`Not signed in to the app yet (${who.notOnApp.length})`}>
        <People list={who.notOnApp} empty="Every parent has signed in." detail={() => ""} />
        {who.notOnApp.length ? (
          <p className="mt-2 text-small">
            <Link href="/admin/parents" className="font-bold text-grass-text underline">
              Invite them
            </Link>
          </p>
        ) : null}
      </Section>
    </div>
  );
}

function People({ list, empty, detail }: { list: Opener[]; empty: string; detail: (o: Opener) => string }) {
  if (list.length === 0) return <p className="text-small text-ink-muted">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {list.map((o) => (
        <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2.5 first:pt-0">
          <Link href={`/admin/families?q=${encodeURIComponent(tidyName(o.name))}`} className="font-bold underline decoration-line underline-offset-2">
            {tidyName(o.name)}
          </Link>
          <span className="text-meta text-ink-muted">{detail(o)}</span>
          <span className="basis-full text-small text-ink-muted">Parent of {o.children}</span>
        </li>
      ))}
    </ul>
  );
}
