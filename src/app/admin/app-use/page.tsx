import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/admin/bits";
import { Bar } from "@/components/admin/charts";
import { busiestDay, busiestHours, loadAppUse, QUIET_DAYS, visitLength, waitWords, WEEKDAYS } from "@/lib/app-use/data";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { AGE_GROUPS } from "@/lib/domain";
import { shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { tidyName } from "@/lib/validate";

export const metadata: Metadata = { title: "App use" };

/**
 * How parents use the app (the owner's question, 23 Nov 2026: few parents tapped "I've read this", so he couldn't
 * tell whether they read and didn't tap, or didn't open the app). Figures from migration 0055: app opens per parent and
 * day, posts seen on screen, reads (and those from the notification's "Mark as read"), and the club's total screen
 * time (no one's name). A group coach sees their own groups' parents.
 */
export default async function AppUsePage({ searchParams }: PageProps<"/admin/app-use">) {
  const user = await requireStaff();
  const { group: asked } = await searchParams;
  const allowed = coachLimit(user.staff!) ?? AGE_GROUPS;
  const group = allowed.find((g) => g === asked) ?? null;
  const use = await asUser(user.id, (tx) => loadAppUse(tx, group ? [group] : allowed));
  const busiest = busiestHours(use.readHours);
  const readDay = busiestDay(use.readDays);
  const maxReadDay = Math.max(1, ...use.readDays);
  const maxOpenDay = Math.max(1, ...use.openDays);
  const openDay = busiestDay(use.openDays.map((n) => Math.round(n * 10)), 30);
  const maxDay = Math.max(1, ...use.daily.map((d) => d.parents));
  const maxHour = Math.max(1, ...use.readHours);

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader
        back={{ href: "/admin", label: "Overview" }}
        title="App use"
        subtitle="Which parents open the app, whether they see and read posts, and when."
      >
        {allowed.length > 1 ? (
          <nav aria-label="Group" className="flex flex-wrap gap-2">
            {[null, ...allowed].map((g) => (
              <Link
                key={g ?? "all"}
                href={g ? `/admin/app-use?group=${g}` : "/admin/app-use"}
                aria-current={g === group ? "page" : undefined}
                className={`inline-flex min-h-12 items-center rounded-pill border px-4 text-[15px] font-bold ${
                  g === group ? "border-grass bg-grass-tint text-grass-text" : "border-line bg-paper text-ink"
                }`}
              >
                {g ?? "All"}
              </Link>
            ))}
          </nav>
        ) : null}
      </PageHeader>

      <ul className="grid grid-cols-3 gap-2.5">
        {[
          { label: "Today", value: use.today, days: 1 },
          { label: "Last 7 days", value: use.week, days: 7 },
          { label: "Last 30 days", value: use.month, days: 30 },
        ].map((t) => (
          <li key={t.label}>
            <Link
              href={`/admin/app-use/who?days=${t.days}${group ? `&group=${group}` : ""}`}
              aria-label={`${t.label}: ${t.value} of ${use.parents} parents opened it. See who`}
              className="flex h-full flex-col gap-1 rounded-app border border-line bg-paper p-3"
            >
              <span className="text-[13px] font-bold text-ink-muted">{t.label}</span>
              <span className="font-display text-[40px] leading-none tabular-nums">{t.value}</span>
              <span className="text-[13px] text-ink-muted">of {use.parents} parents opened it</span>
              <span className="text-[13px] font-bold text-grass-text underline">See who</span>
            </Link>
          </li>
        ))}
      </ul>

      <Section title="Parents opening the app each day">
        <div aria-hidden className="flex h-28 items-end gap-[3px]">
          {use.daily.map((d) => (
            <span key={d.day} className="flex-1 rounded-t-[3px] bg-grass" style={{ height: `${Math.max(2, (d.parents / maxDay) * 100)}%` }} title={`${shortDay(d.day)}: ${d.parents}`} />
          ))}
        </div>
        <div aria-hidden className="mt-1 flex justify-between text-[13px] text-ink-muted">
          <span>{use.daily.length ? shortDay(use.daily[0].day) : ""}</span>
          <span>Today</span>
        </div>
        <details className="mt-2 text-[14px]">
          <summary className="inline-flex min-h-12 cursor-pointer items-center font-bold text-grass-text underline">Show as table</summary>
          <table className="w-full">
            <caption className="sr-only">Parents who opened the app each day, last 30 days</caption>
            <thead>
              <tr className="text-left text-[13px] text-ink-muted">
                <th scope="col" className="py-1 font-bold">
                  Day
                </th>
                <th scope="col" className="py-1 font-bold">
                  Parents
                </th>
              </tr>
            </thead>
            <tbody>
              {use.daily.map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="py-1">{shortDay(d.day)}</td>
                  <td className="py-1 tabular-nums">{d.parents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <p className="mt-2 text-[15px]">
          {use.averageSeconds === null
            ? "Time in the app shows here once parents have used it for a few days."
            : `${use.visits.toLocaleString("en-GB")} visits in the last 30 days, ${visitLength(use.averageSeconds)} on average (the whole club, no one's name).`}
        </p>
        {use.comeBack && use.comeBack.before > 0 ? (
          <p className="text-[15px]">
            {use.comeBack.returned} of the {use.comeBack.before} parents who opened it the week before came back in the last 7 days.
          </p>
        ) : null}
        {use.newParents ? (
          <p className="text-[15px]">
            {use.newParents.opened} of {use.newParents.added} parents added since 23 November opened the app in their first week.
          </p>
        ) : null}
        <p className="text-[14px] text-ink-muted">
          {use.signedIn} of {use.parents} parents have signed in at least once.{" "}
          <Link href="/admin/parents" className="font-bold text-grass-text underline">
            See who hasn&apos;t
          </Link>
        </p>
      </Section>

      <Section title="Posts that ask for a tap">
        {use.posts.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Nothing posted yet that asks parents to tap I&apos;ve read this.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {use.posts.map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                <Link href={`/admin/news/${p.id}`} className="font-bold underline decoration-line underline-offset-2">
                  {p.title}
                </Link>
                <span className="text-[13px] text-ink-muted">{shortDay(p.postedAt)}</span>
                <Bar
                  label={p.title}
                  segments={[
                    { label: "read", value: p.read, tone: "done" },
                    { label: "seen, not tapped", value: p.seen - p.read, tone: "other" },
                    { label: "not seen", value: Math.max(0, p.reached - p.seen), tone: "rest" },
                  ]}
                />
                <span className="text-[14px]">
                  <b className="tabular-nums">{p.read}</b> read · <b className="tabular-nums">{p.seen - p.read}</b> seen, not tapped ·{" "}
                  <b className="tabular-nums">{Math.max(0, p.reached - p.seen)}</b> not seen <span className="text-ink-muted">of {p.reached}</span>
                </span>
                <span className="text-[13px] text-ink-muted">
                  {p.readInADay} read within a day
                  {p.medianMinutes === null ? "" : ` · typically read after ${waitWords(p.medianMinutes)}`}
                  {p.fromNotification ? ` · ${p.fromNotification} from the notification` : ""}
                  {p.afterEmail ? ` · ${p.afterEmail} after the reminder email` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[13px] text-ink-muted">Seen counts once a post&apos;s headline has been on a parent&apos;s screen. It started on 23 November, so older posts show fewer.</p>
      </Section>

      <Section title="When parents read posts">
        <div aria-hidden className="flex h-20 items-end gap-[2px]">
          {use.readHours.map((n, h) => (
            <span key={h} className="flex-1 rounded-t-[2px] bg-chart-1" style={{ height: `${Math.max(2, (n / maxHour) * 100)}%` }} title={`${h}:00: ${n}`} />
          ))}
        </div>
        <div aria-hidden className="mt-1 flex justify-between text-[13px] text-ink-muted">
          <span>Midnight</span>
          <span>6am</span>
          <span>Midday</span>
          <span>6pm</span>
          <span>11pm</span>
        </div>
        <p className="mt-2 text-[15px]">
          {busiest ? `Most posts are read between ${busiest}. Posting just before then gets them seen soonest.` : "Not enough reads in the last 60 days to say yet."}
        </p>
      </Section>

      <Section title="Which days parents read posts">
        <ul className="flex h-24 items-end gap-2">
          {use.readDays.map((n, i) => (
            <li key={WEEKDAYS[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[13px] tabular-nums">{n}</span>
              <span aria-hidden className="w-full rounded-t-[3px] bg-chart-1" style={{ height: `${Math.max(2, (n / maxReadDay) * 70)}%` }} />
              <span className="text-[13px] text-ink-muted">
                <span aria-hidden>{WEEKDAYS[i].slice(0, 3)}</span>
                <span className="sr-only">{WEEKDAYS[i]}: reads</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[15px]">
          {readDay ? `Most posts are read on ${readDay}.` : "Not enough reads in the last 60 days to pick a day yet."}
        </p>
      </Section>

      <Section title="Which days parents open the app">
        <ul className="flex h-24 items-end gap-2">
          {use.openDays.map((n, i) => (
            <li key={WEEKDAYS[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[13px] tabular-nums">{n}</span>
              <span aria-hidden className="w-full rounded-t-[3px] bg-grass" style={{ height: `${Math.max(2, (n / maxOpenDay) * 70)}%` }} />
              <span className="text-[13px] text-ink-muted">
                <span aria-hidden>{WEEKDAYS[i].slice(0, 3)}</span>
                <span className="sr-only">{WEEKDAYS[i]}: parents on an average day</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[15px]">
          {openDay ? `${openDay} are busiest. ` : ""}Parents opening the app on an average day of the week, over the last 4 weeks.
        </p>
      </Section>

      <Section title="Answers to Is your child coming?">
        {use.answers.length === 0 ? (
          <p className="text-[15px] text-ink-muted">No sessions have finished yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {use.answers.map((a) => (
              <li key={a.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                <span className="font-bold">
                  {a.title} <span className="font-normal text-ink-muted">· {shortDay(a.startsAt)}</span>
                </span>
                <Bar
                  label={`${a.title}, ${shortDay(a.startsAt)}`}
                  segments={[
                    { label: "answered a day or more ahead", value: a.dayAhead, tone: "done" },
                    { label: "answered on the day", value: a.answered - a.dayAhead, tone: "other" },
                    { label: "no answer before it started", value: Math.max(0, a.children - a.answered), tone: "rest" },
                  ]}
                />
                <span className="text-[14px]">
                  <b className="tabular-nums">{a.dayAhead}</b> a day or more ahead · <b className="tabular-nums">{a.answered - a.dayAhead}</b> in the last day ·{" "}
                  <b className="tabular-nums">{Math.max(0, a.children - a.answered)}</b> no answer <span className="text-ink-muted">of {a.children} children</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={use.quietFrom ? `Not opened for ${QUIET_DAYS} days or more` : `Not opened for ${QUIET_DAYS} days or more (${use.quiet.length})`}>
        {use.quietFrom ? (
          <p className="text-[15px] text-ink-muted">
            Too early to say. The app has only kept a note of who opens it since 23 November, so this list starts on {shortDay(use.quietFrom)}.
          </p>
        ) : use.quiet.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Every parent on the app has opened it in the last {QUIET_DAYS} days.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {use.quiet.map((q) => (
              <li key={q.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2.5">
                <Link href={`/admin/families?q=${encodeURIComponent(tidyName(q.name))}`} className="font-bold underline decoration-line underline-offset-2">
                  {tidyName(q.name)}
                </Link>
                <span className="text-[13px] text-ink-muted">{q.lastOpened ? `Last opened ${shortDay(q.lastOpened)}` : "Not opened since 23 Nov, when counting began"}</span>
                <span className="basis-full text-[14px] text-ink-muted">Parent of {q.children}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
