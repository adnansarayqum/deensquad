import { Download } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AdminTitle, Notice, ReadBar, Section } from "@/components/admin/bits";
import { ColumnChart, Figure, PercentBar, StackedBar } from "@/components/admin/charts";
import { CHANNELS, loadDashboard, type Channel, type Dashboard } from "@/lib/admin/dashboard";
import { closeDataRequest } from "@/lib/admin/actions";
import { TODO_NEEDS } from "@/lib/admin/needs";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser, isDemo } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { greetingName } from "@/lib/greeting";
import { emailConfigured } from "@/lib/email/send";
import { EXPORTS } from "@/lib/exports/reports";
import { formatPence } from "@/lib/shop/data";

export const metadata: Metadata = { title: "Overview" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const dayMonth = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(new Date(iso));

const TODO_LABEL: Record<(typeof TODO_NEEDS)[number], string> = {
  contacts: "no emergency contact",
  payment: "no payment plan",
  contract: "contract not signed",
  consent: "no photo answer",
};

/** Counts each parent's own taps: the chase ladder stops once a partner has read it, so this can be higher. */
const BEHIND_TEXT = (n: number) => `${n === 1 ? "parent hasn't" : "parents haven't"} tapped ‘I’ve read this’ on 2 or more messages (a partner may have)`;

const CHANNEL_LABEL: Record<Channel, string> = {
  app: "App notifications",
  email: "Emails",
  sms: "Text messages",
  whatsapp: "WhatsApp",
  gate: "Flagged at the gate",
};

export default async function AdminHome() {
  const user = await requireStaff();
  const isAdmin = user.staff.role === "admin";
  const limit = coachLimit(user.staff);
  const d = await asUser(user.id, (tx) => loadDashboard(tx, { now: new Date(), limit, withShop: isAdmin, withRequests: isAdmin }));
  const empty = d.players === 0;

  return (
    <>
      <AdminTitle>Assalamu alaikum, {greetingName(user.staff.displayName)}</AdminTitle>

      {isAdmin && !emailConfigured() && process.env.NODE_ENV === "production" && !isDemo() ? (
        <Notice tone="action">
          Email isn&apos;t set up yet, so parents can&apos;t get sign-in codes or invites. Add <b>RESEND_API_KEY</b> and <b>EMAIL_FROM</b> to the
          app&apos;s variables in Railway.
        </Notice>
      ) : null}

      {d.deletionRequests?.length ? <DeletionRequests requests={d.deletionRequests} /> : null}

      {empty && isAdmin ? (
        <Section title="Get started">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-[22px]">
            <li>
              <Link href="/admin/families/import" className="font-bold text-grass-text underline">
                Import families
              </Link>{" "}
              from a spreadsheet: one row per child, with a parent&apos;s email.
            </li>
            <li>
              <Link href="/admin/sessions" className="font-bold text-grass-text underline">
                Add this term&apos;s sessions
              </Link>{" "}
              so parents can say who&apos;s coming.
            </li>
            <li>
              <Link href="/admin/staff" className="font-bold text-grass-text underline">
                Add your coaches
              </Link>{" "}
              so they can use the register and post news.
            </li>
            <li>Send the invites from the Families page.</li>
          </ol>
        </Section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <AttendanceSection d={d} limited={limit !== null} />
        <FamiliesSection d={d} limited={limit !== null} />
        <PaymentsSection d={d} />
        <NewsSection d={d} />
      </div>

      {isAdmin ? (
        <Section title="Download spreadsheets" aside={<span className="text-sm text-ink-muted">Open in Excel or Google Sheets</span>}>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(EXPORTS).map(([kind, e]) => (
              <li key={kind}>
                <a href={`/api/admin/export/${kind}`} download className="flex h-full items-start gap-3 rounded-app border-2 border-line bg-paper p-3">
                  <Download aria-hidden size={20} className="mt-0.5 shrink-0 text-grass-text" />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-bold">{e.label}</span>
                    <span className="text-[13px] text-ink-muted">{e.detail}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

/** Parents who asked (Player → Your data) to have their account deleted. Nothing is deleted until an admin acts. */
function DeletionRequests({ requests }: { requests: NonNullable<Dashboard["deletionRequests"]> }) {
  return (
    <section aria-labelledby="deletion-requests" className="flex flex-col gap-3 rounded-app border-2 border-kit-orange bg-paper p-4">
      <h2 id="deletion-requests" className="text-[17px] font-extrabold">
        {requests.length === 1 ? "1 family asked to be deleted" : `${requests.length} families asked to be deleted`}
      </h2>
      <p className="text-[15px] leading-[22px] text-ink-muted">
        Check with the family first. Removing a child on Families deletes parents left with no children, and that closes the request. Tap Done if
        you&apos;ve dealt with it another way.
      </p>
      <ul className="flex flex-col divide-y-2 divide-line">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-bold">
                {r.parentName} <span className="font-normal text-ink-muted">· asked {dayMonth(r.askedAt)}</span>
              </span>
              {r.children.length ? (
                <span className="flex flex-wrap gap-x-3 text-[15px]">
                  {r.children.map((c) => (
                    <Link key={c.id} href={`/admin/families/${c.id}`} className="inline-flex min-h-12 items-center font-bold text-grass-text underline">
                      {c.name}
                    </Link>
                  ))}
                </span>
              ) : (
                <span className="text-[13px] text-ink-muted">No children linked.</span>
              )}
            </span>
            <form action={closeDataRequest}>
              <input type="hidden" name="request" value={r.id} />
              <button type="submit" className="btn-chunky btn-paper min-h-12" aria-label={`Done: ${r.parentName}'s request`}>
                Done
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="text-label text-ink-muted uppercase">{children}</h3>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-ink-muted">{children}</p>;
}

function AttendanceSection({ d, limited }: { d: Dashboard; limited: boolean }) {
  const next = d.attendance.next.filter((g) => g.squad > 0);
  const season = d.attendance.season.filter((g) => g.squad > 0);
  const noChildren = limited ? "No children in your groups yet." : "No children yet.";
  return (
    <Section
      title="Attendance"
      aside={
        <Link href="/admin/sessions" className="inline-flex min-h-12 items-center text-sm font-bold text-grass-text underline">
          Sessions
        </Link>
      }
    >
      <Sub>Next session</Sub>
      {next.length === 0 ? (
        <Empty>{noChildren}</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {next.map((g) => (
            <li key={g.group} className="flex flex-col gap-1">
              <p className="text-[15px]">
                <b>{g.group}</b>{" "}
                <span className="text-ink-muted">
                  {g.session ? `· ${shortDay(g.session.startsAt)} · ${g.session.title} ${clock(g.session.startsAt)}` : "· No session coming up"}
                </span>
              </p>
              {g.session ? (
                <StackedBar
                  label={`${g.group}, ${shortDay(g.session.startsAt)}`}
                  segments={[
                    { label: "coming", value: g.coming, tone: "done", href: `/coach?session=${g.session.id}&group=${g.group}` },
                    { label: "not coming", value: g.away, tone: "neutral", href: `/coach?session=${g.session.id}&group=${g.group}` },
                    { label: "not answered", value: g.unanswered, tone: "rest", href: `/coach?session=${g.session.id}&group=${g.group}` },
                  ]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Sub>This season (from 1 August), sessions with the register taken</Sub>
      {season.length === 0 ? (
        <Empty>{noChildren}</Empty>
      ) : (
        <table className="w-full text-[14px]">
          <caption className="sr-only">Sessions held and average attendance this season, by age group</caption>
          <thead>
            <tr className="text-left text-label text-ink-muted uppercase">
              <th scope="col" className="py-1 pr-2 font-bold">
                Group
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-bold">
                Held
              </th>
              <th scope="col" className="py-1 font-bold">
                Average attendance
              </th>
            </tr>
          </thead>
          <tbody>
            {season.map((g) => (
              <tr key={g.group} className="border-t border-line">
                <th scope="row" className="py-2 pr-2 text-left font-bold">
                  {g.group}
                </th>
                <td className="py-2 pr-2 text-right tabular-nums">
                  <Link href="/admin/sessions" aria-label={`${g.held} ${g.group} ${g.held === 1 ? "session" : "sessions"} held`} className="inline-flex min-h-12 items-center justify-end font-bold underline decoration-line underline-offset-4">
                    {g.held}
                  </Link>
                </td>
                <td className="py-2">
                  {g.averagePct === null ? (
                    <span className="text-ink-muted">Register not used yet</span>
                  ) : (
                    <PercentBar pct={g.averagePct} label={`${g.group}: ${g.averagePct}% of the children in the group on the day checked in on average`} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Sub>Checked in at the last {d.attendance.recent.length || 8} sessions</Sub>
      {d.attendance.recent.length === 0 ? (
        <Empty>No sessions held yet.</Empty>
      ) : (
        <ColumnChart
          title={`Children checked in at the last ${plural(d.attendance.recent.length, "session", "sessions")}`}
          unit="checked in"
          columns={d.attendance.recent.map((s) => ({
            key: s.id,
            value: s.checkedIn,
            label: dayMonth(s.startsAt),
            detail: `${shortDay(s.startsAt)} ${s.title}`,
            href: "/admin/sessions",
          }))}
        />
      )}
    </Section>
  );
}

function FamiliesSection({ d, limited }: { d: Dashboard; limited: boolean }) {
  const f = d.families;
  return (
    <Section
      title="Families and to-dos"
      aside={
        <Link href="/admin/families" className="inline-flex min-h-12 items-center text-sm font-bold text-grass-text underline">
          Families
        </Link>
      }
    >
      <Sub>{plural(f.parents, "parent", "parents")}</Sub>
      {f.parents === 0 ? (
        <Empty>{limited ? "No parents in your groups yet." : "No parents yet."}</Empty>
      ) : (
        <StackedBar
          label="Parents"
          segments={[
            { label: "signed in", value: f.signedIn, tone: "done", href: "/admin/families" },
            { label: "invited, not signed in", value: f.invited, tone: "neutral", href: "/admin/families?need=signin" },
            { label: "not invited", value: f.notInvited, tone: "action", href: "/admin/families?need=invite" },
          ]}
        />
      )}
      {f.parents > 0 ? (
        <p className="-mt-1 text-[13px] text-ink-muted">
          These count parents. Their links list the children whose parents haven&apos;t signed in yet or weren&apos;t invited.
        </p>
      ) : null}

      <Sub>Children with to-dos left (of {plural(d.players, "child", "children")})</Sub>
      <ul className="grid grid-cols-2 gap-2">
        {TODO_NEEDS.map((n) => (
          <li key={n}>
            <Figure value={f.todo[n]} label={TODO_LABEL[n]} href={`/admin/families?need=${n}`} action={f.todo[n] > 0} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PaymentsSection({ d }: { d: Dashboard }) {
  const p = d.payments;
  return (
    <Section title={d.shop ? "Payments and shop" : "Payments"}>
      <Sub>Monthly plans (TeamFeePay)</Sub>
      {d.players === 0 ? (
        <Empty>No children yet.</Empty>
      ) : (
        <StackedBar
          label="Monthly plans"
          segments={[
            { label: "active", value: p.active, tone: "done", href: "/admin/families" },
            { label: "to check", value: p.self_reported, tone: "neutral", href: "/admin/families?need=check" },
            { label: "overdue", value: p.overdue, tone: "action", href: "/admin/families?need=overdue" },
            { label: "no plan yet", value: p.missing, tone: "rest", href: "/admin/families?need=missing" },
          ]}
        />
      )}

      {d.shop ? (
        <>
          <Sub>Shop orders</Sub>
          <ul className="grid grid-cols-3 gap-2">
            <li>
              <Figure value={d.shop.awaitingPayment} label="waiting for payment" href="/admin/shop" />
            </li>
            <li>
              <Figure value={d.shop.toOrder} label="paid, to order from the supplier" href="/admin/shop" action={d.shop.toOrder > 0} />
            </li>
            <li>
              <Figure value={d.shop.ready} label="ready to collect" href="/admin/shop" />
            </li>
          </ul>
          <Sub>Paid sales</Sub>
          <ul className="grid grid-cols-2 gap-2">
            <li>
              <Figure value={formatPence(d.shop.monthPence)} label="this month" href="/admin/shop?view=past" />
            </li>
            <li>
              <Figure value={formatPence(d.shop.seasonPence)} label="this season (from 1 August)" href="/admin/shop?view=past" />
            </li>
          </ul>
        </>
      ) : null}
    </Section>
  );
}

function NewsSection({ d }: { d: Dashboard }) {
  const n = d.news;
  return (
    <Section
      title="News and reminders"
      aside={
        <Link href="/admin/news" className="inline-flex min-h-12 items-center text-sm font-bold text-grass-text underline">
          Post news
        </Link>
      }
    >
      <Sub>Messages to read and acknowledge</Sub>
      {n.recent.length === 0 ? (
        <Empty>Nothing posted that asks parents to tap &ldquo;I&apos;ve read this&rdquo; yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {n.recent.map((m) => {
            const unread = m.total - m.read;
            return (
              <li key={m.id} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <Link href={`/admin/news/${m.id}`} className="inline-flex min-h-12 min-w-0 items-center text-[15px] font-bold underline decoration-line underline-offset-4">
                    {m.title}
                  </Link>
                  <Link
                    href={`/admin/news/${m.id}`}
                    className={`inline-flex min-h-12 items-center text-[14px] font-bold ${unread > 0 ? "text-kit-orange" : "text-grass-text"}`}
                  >
                    {unread > 0 ? `${unread} not read` : "Everyone has read it"}
                  </Link>
                </div>
                <ReadBar read={m.read} total={m.total} />
              </li>
            );
          })}
        </ul>
      )}

      <Sub>Reminders sent in the last 7 days</Sub>
      <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
        {CHANNELS.map((c) => (
          <li key={c}>
            <Link href="/admin/families?need=unread" aria-label={`${n.reminders[c]} ${CHANNEL_LABEL[c].toLowerCase()}. See parents behind on news`} className="flex min-h-12 items-center justify-between gap-2 border-b border-line text-[14px]">
              <span>{CHANNEL_LABEL[c]}</span>
              <b className="tabular-nums">{n.reminders[c]}</b>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-ink-muted">Each count opens the parents still behind on news.</p>

      <Link href="/admin/families?need=unread" aria-label={`${n.behind} ${BEHIND_TEXT(n.behind)}`} className="flex min-h-12 items-center gap-3 rounded-dash border-2 border-line px-3 py-2 hover:bg-cream">
        <span className={`font-display text-[36px] leading-none tabular-nums ${n.behind > 0 ? "text-kit-orange" : "text-ink"}`}>{n.behind}</span>
        <span className={`text-[14px] ${n.behind > 0 ? "font-bold text-kit-orange" : "text-ink-muted"}`}>
          {BEHIND_TEXT(n.behind)}
        </span>
      </Link>
    </Section>
  );
}
