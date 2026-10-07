import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminTitle, Notice, Section } from "@/components/admin/bits";
import { AttendanceChart, Bar, BarLink, HBarList, NeedLink, Sparkline, StackedBar, StatTile } from "@/components/admin/charts";
import { CHANNELS, loadDashboard, type Channel, type Dashboard } from "@/lib/admin/dashboard";
import { closeDataRequest } from "@/lib/admin/actions";
import { TODO_NEEDS } from "@/lib/admin/needs";
import { attendanceChart, needsYou, newsReadPct, nextSessionSummary, registerHref, type NextSessionSummary } from "@/lib/admin/overview";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser, isDemo } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { greetingName } from "@/lib/greeting";
import { emailConfigured } from "@/lib/email/send";
import { EXPORTS } from "@/lib/exports/reports";
import { formatPence } from "@/lib/shop/data";

export const metadata: Metadata = { title: "Overview" };

const dayMonth = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(new Date(iso));

/** "Needs you" shows this many rows; the rest are a tap away on Families. */
const NEEDS_SHOWN = 5;

const TODO_LABEL: Record<(typeof TODO_NEEDS)[number], string> = {
  contacts: "no emergency contact",
  payment: "no payment plan",
  contract: "contract not signed",
  consent: "no photo answer",
};

const CHANNEL_LABEL: Record<Channel, [string, string]> = {
  app: ["app notification", "app notifications"],
  email: ["email", "emails"],
  sms: ["text", "texts"],
  whatsapp: ["WhatsApp", "WhatsApps"],
  gate: ["flag at the gate", "flags at the gate"],
};

export default async function AdminHome() {
  const user = await requireStaff();
  const isAdmin = user.staff.role === "admin";
  const limit = coachLimit(user.staff);
  const now = new Date();
  const d = await asUser(user.id, (tx) => loadDashboard(tx, { now, limit, withShop: isAdmin, withRequests: isAdmin }));
  const empty = d.players === 0;
  const next = nextSessionSummary(d, now);

  return (
    <>
      <div className="flex flex-col gap-1">
        <AdminTitle>Assalamu alaikum, {greetingName(user.staff.displayName)}</AdminTitle>
        {next ? (
          <p className="text-[15px] text-ink-muted">
            {next.day}: {next.coming} of {next.squad} {next.squad === 1 ? "child" : "children"} coming
          </p>
        ) : null}
      </div>

      {isAdmin && !emailConfigured() && process.env.NODE_ENV === "production" && !isDemo() ? (
        <Notice tone="action">
          Email isn&apos;t set up yet, so parents can&apos;t get sign-in codes or invites. Add <b>RESEND_API_KEY</b> and <b>EMAIL_FROM</b> to the
          app&apos;s variables in Railway.
        </Notice>
      ) : null}

      {d.deletionRequests?.length ? <DeletionRequests requests={d.deletionRequests} /> : null}

      {empty ? (
        isAdmin ? (
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
        ) : (
          <p className="text-[15px] text-ink-muted">{limit ? "No children in your groups yet." : "No children yet."}</p>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
          <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <NeedsYou d={d} now={now} />
          </div>
          <div className="lg:col-span-2 lg:col-start-2 lg:row-start-1">
            <Tiles d={d} next={next} />
          </div>
          <div className="lg:col-span-2 lg:col-start-2 lg:row-start-2">
            <AttendanceSection d={d} />
          </div>
          <NextSessionSection d={d} />
          <FamiliesSection d={d} />
          <NewsSection d={d} />
          {d.shop && (d.shop.orders > 0 || d.shop.seasonPence > 0) ? <ShopSection shop={d.shop} /> : null}
        </div>
      )}

      {isAdmin ? (
        <details className="rounded-app border-2 border-line bg-paper px-4">
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 text-[15px] font-bold">
            <Download aria-hidden size={18} className="text-grass-text" />
            Download spreadsheets
          </summary>
          <ul className="grid gap-x-4 pb-3 sm:grid-cols-2">
            {Object.entries(EXPORTS).map(([kind, e]) => (
              <li key={kind}>
                <a href={`/api/admin/export/${kind}`} download className="flex min-h-12 flex-col justify-center border-t border-line py-1.5">
                  <span className="text-[15px] font-bold text-grass-text underline underline-offset-4">{e.label}</span>
                  <span className="text-[13px] text-ink-muted">{e.detail}</span>
                </a>
              </li>
            ))}
          </ul>
        </details>
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
        Check with the family first. Removing a child on Families deletes parents left with no children, and that closes the request. If another parent is staying, unlink this parent from each child instead, so the child stays. Tap Done if
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

function NeedsYou({ d, now }: { d: Dashboard; now: Date }) {
  const rows = needsYou(d, now);
  const hidden = rows.length - NEEDS_SHOWN;
  return (
    <section aria-labelledby="needs-you" className="flex flex-col gap-1 rounded-app border-2 border-line bg-paper px-4 pt-2 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 id="needs-you" className="text-[17px] font-extrabold">
          Needs you
        </h2>
        {rows.length ? (
          <Link href="/admin/families" className="inline-flex min-h-12 items-center text-sm font-bold text-grass-text underline">
            {hidden > 0 ? `See all to-dos (${hidden} more)` : "See all to-dos"}
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="flex min-h-12 items-center text-[15px] font-bold text-grass-text">All up to date.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.slice(0, NEEDS_SHOWN).map((r) => (
            <li key={r.key}>
              <NeedLink href={r.href} count={r.count} text={r.text} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tiles({ d, next }: { d: Dashboard; next: NextSessionSummary | null }) {
  const f = d.families;
  const news = newsReadPct(d.news.recent.slice(0, 3));
  const spark = d.attendance.sessions.slice(-10).map((s) => s.pct);
  const signInHref = f.signedIn === f.parents ? "/admin/families" : f.notInvited > 0 ? "/admin/families?need=invite" : "/admin/families?need=signin";
  return (
    <ul aria-label="At a glance" className="grid grid-cols-1 gap-3 min-[300px]:grid-cols-2 sm:grid-cols-4">
      <li className="flex">
        <StatTile
          href={next?.href ?? "/admin/sessions"}
          name={next ? `${next.coming} of ${next.squad} coming ${next.day === "Today" || next.day === "Tomorrow" ? next.day.toLowerCase() : `on ${next.day}`}` : "No session coming up"}
          label={next ? `Coming ${next.day === "Today" || next.day === "Tomorrow" ? next.day.toLowerCase() : next.day}` : "Next session"}
          value={next ? String(next.coming) : "–"}
          of={next ? `of ${next.squad}` : "none coming up"}
        >
          {next ? <Bar thin label="Coming" segments={[{ label: "coming", value: next.coming, tone: "done" }, { label: "not yet", value: next.squad - next.coming, tone: "rest" }]} /> : null}
        </StatTile>
      </li>
      <li className="flex">
        <StatTile
          href="/admin/sessions"
          name={d.attendance.seasonPct === null ? "Attendance this season: no register taken yet" : `Attendance this season: ${d.attendance.seasonPct}%`}
          label="Season attendance"
          value={d.attendance.seasonPct === null ? "–" : `${d.attendance.seasonPct}%`}
          of={d.attendance.seasonPct === null ? "no register yet" : undefined}
        >
          <Sparkline values={spark} />
        </StatTile>
      </li>
      <li className="flex">
        <StatTile href={signInHref} name={`${f.signedIn} of ${f.parents} parents signed in`} label="Parents signed in" value={String(f.signedIn)} of={`of ${f.parents}`}>
          <Bar thin label="Parents" segments={[{ label: "signed in", value: f.signedIn, tone: "done" }, { label: "not yet", value: f.parents - f.signedIn, tone: "rest" }]} />
        </StatTile>
      </li>
      <li className="flex">
        <StatTile
          href="/admin/news"
          name={news ? `News read: ${news.pct}% (${news.read} of ${news.total}) on the latest messages` : "News read: nothing asks to be read yet"}
          label="News read"
          value={news ? `${news.pct}%` : "–"}
          of={news ? `latest ${Math.min(3, d.news.recent.length)}` : "none asked"}
        >
          {news ? <Bar thin label="Read" segments={[{ label: "read", value: news.read, tone: "done" }, { label: "not read", value: news.total - news.read, tone: "rest" }]} /> : null}
        </StatTile>
      </li>
    </ul>
  );
}

function AttendanceSection({ d }: { d: Dashboard }) {
  const title = "Attendance at each session this season (from 1 August)";
  return (
    <Section
      title="Attendance this season"
      aside={
        <Link href="/admin/sessions" className="inline-flex min-h-12 items-center text-sm font-bold text-grass-text underline">
          Sessions
        </Link>
      }
    >
      {d.attendance.sessions.length === 0 ? (
        <p className="text-[15px] text-ink-muted">No registers taken yet this season.</p>
      ) : (
        <AttendanceChart data={attendanceChart(d)} title={title} />
      )}
    </Section>
  );
}

function NextSessionSection({ d }: { d: Dashboard }) {
  const groups = d.attendance.next.filter((g) => g.squad > 0);
  // When every group's next session starts at the same time, the time is said once, in the heading.
  const times = new Set(groups.map((g) => g.session?.startsAt ?? ""));
  const first = groups[0]?.session;
  const sameTime = times.size === 1 && first ? first.startsAt : null;
  return (
    <Section title="Next session" aside={sameTime ? <span className="text-[14px] text-ink-muted">{`${shortDay(sameTime)}, ${clock(sameTime)}`}</span> : undefined}>
      <ul className="flex flex-col">
        {groups.map((g) => (
          <li key={g.group}>
            {g.session ? (
              <BarLink
                href={registerHref(g.session.id, [g.group])}
                name={`${g.group}, ${shortDay(g.session.startsAt)}: ${g.coming} coming, ${g.away} not coming, ${g.unanswered} not answered. Open the register`}
                heading={g.group}
                aside={sameTime ? undefined : `${shortDay(g.session.startsAt)}, ${clock(g.session.startsAt)}`}
                label={`${g.group}, ${shortDay(g.session.startsAt)}`}
                segments={[
                  { label: "coming", value: g.coming, tone: "done" },
                  { label: "not coming", value: g.away, tone: "neutral" },
                  { label: "not answered", value: g.unanswered, tone: "rest" },
                ]}
              />
            ) : (
              <p className="flex min-h-12 items-center justify-between gap-3 text-[14px]">
                <b>{g.group}</b> <span className="text-ink-muted">No session coming up</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function FamiliesSection({ d }: { d: Dashboard }) {
  const p = d.payments;
  return (
    <Section
      title="Families and payments"
      aside={
        <Link href="/admin/families" className="inline-flex min-h-12 items-center text-sm font-bold text-grass-text underline">
          Families
        </Link>
      }
    >
      <h3 className="text-[14px] font-bold text-ink-muted">To-dos left (of {d.players === 1 ? "1 child" : `${d.players} children`})</h3>
      <HBarList
        title="Children with to-dos left"
        max={d.players}
        rows={TODO_NEEDS.map((n) => ({ key: n, label: TODO_LABEL[n], value: d.families.todo[n], href: `/admin/families?need=${n}` }))}
      />
      <h3 className="text-[14px] font-bold text-ink-muted">Monthly plans (TeamFeePay)</h3>
      <StackedBar
        label="Monthly plans"
        hideZero
        segments={[
          { label: "active", value: p.active, tone: "done", href: "/admin/families" },
          { label: "to check", value: p.self_reported, tone: "neutral", href: "/admin/families?need=check" },
          { label: "overdue", value: p.overdue, tone: "strong", href: "/admin/families?need=overdue" },
          { label: "no plan yet", value: p.missing, tone: "rest", href: "/admin/families?need=missing" },
        ]}
      />
    </Section>
  );
}

function NewsSection({ d }: { d: Dashboard }) {
  const n = d.news;
  const sent = CHANNELS.filter((c) => n.reminders[c] > 0);
  return (
    <Section
      title="News"
      aside={
        <Link href="/admin/news" className="inline-flex min-h-12 items-center text-sm font-bold text-grass-text underline">
          Post news
        </Link>
      }
    >
      {n.recent.length === 0 ? (
        <p className="text-[15px] text-ink-muted">Nothing posted that asks parents to tap &ldquo;I&apos;ve read this&rdquo; yet.</p>
      ) : (
        <ul className="flex flex-col">
          {n.recent.slice(0, 3).map((m) => {
            const unread = m.total - m.read;
            return (
              <li key={m.id}>
                <Link
                  href={`/admin/news/${m.id}`}
                  // Two messages can both be "20 not read": the name says which message's readers it opens.
                  aria-label={`${m.title}: ${m.read} of ${m.total} read. ${unread > 0 ? `${unread} not read: see who hasn't read it` : "Everyone has read it"}`}
                  className="-mx-2 flex min-h-12 flex-col gap-1.5 rounded-dash px-2 py-2 hover:bg-cream"
                >
                  <span className="text-[14px] leading-5 font-bold underline decoration-line underline-offset-4">{m.title}</span>
                  <span className="flex items-center gap-2.5">
                    <Bar thin label="Read" segments={[{ label: "read", value: m.read, tone: "done" }, { label: "not read", value: unread, tone: "rest" }]} />
                    <span className="shrink-0 text-[13px] font-bold tabular-nums">
                      {m.read} of {m.total}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[14px] text-ink-muted">
        {sent.length === 0 ? (
          "No reminders sent this week."
        ) : (
          <>
            Reminders this week:{" "}
            {sent.map((c, i) => (
              <span key={c}>
                {i > 0 ? ", " : ""}
                <b className="text-ink">{n.reminders[c]}</b> {CHANNEL_LABEL[c][n.reminders[c] === 1 ? 0 : 1]}
              </span>
            ))}
            .
          </>
        )}
      </p>
    </Section>
  );
}

function ShopSection({ shop }: { shop: NonNullable<Dashboard["shop"]> }) {
  const states = (
    [
      [shop.awaitingPayment, "waiting for payment"],
      [shop.toOrder, "to order"],
      [shop.ordered, "with the supplier"],
      [shop.ready, "ready to collect"],
    ] as const
  ).filter(([n]) => n > 0);
  return (
    <Section title="Shop">
      <Link
        href="/admin/shop?view=past"
        aria-label={`Paid takings: ${formatPence(shop.monthPence)} this month, ${formatPence(shop.seasonPence)} this season`}
        className="-mx-2 flex min-h-12 flex-wrap items-baseline gap-x-4 rounded-dash px-2 py-1 hover:bg-cream"
      >
        <span className="text-[14px] text-ink-muted">
          This month <b className="font-display text-[28px] leading-none text-ink">{formatPence(shop.monthPence)}</b>
        </span>
        <span className="text-[14px] text-ink-muted">
          Season <b className="font-display text-[28px] leading-none text-ink">{formatPence(shop.seasonPence)}</b>
        </span>
      </Link>
      {states.length ? (
        <Link href="/admin/shop" className="-mx-2 flex min-h-12 items-center rounded-dash px-2 text-[14px] hover:bg-cream">
          <span>
            {states.map(([n, label], i) => (
              <span key={label}>
                {i > 0 ? " · " : ""}
                <b className="tabular-nums">{n}</b> {label}
              </span>
            ))}
          </span>
        </Link>
      ) : (
        <p className="text-[14px] text-ink-muted">No orders open.</p>
      )}
    </Section>
  );
}
