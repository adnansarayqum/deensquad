import type { Metadata } from "next";
import Link from "next/link";
import { AdminTitle, Notice, ReadBar, Section } from "@/components/admin/bits";
import { loadNewsList, loadOverview, loadSessionsAdmin } from "@/lib/admin/data";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { emailConfigured } from "@/lib/email/send";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminHome() {
  const user = await requireStaff();
  const now = new Date();
  const [overview, news, sessions] = await asUser(user.id, (tx) =>
    Promise.all([loadOverview(tx), loadNewsList(tx, 1), loadSessionsAdmin(tx, now)]),
  );
  const latest = news[0];
  const next = sessions.upcoming.find((s) => !s.cancelled);
  const isAdmin = user.staff.role === "admin";

  const stats = [
    { label: "players", value: overview.players, href: "/admin/families" },
    { label: `of ${overview.guardians} parents signed in`, value: overview.signedIn, href: "/admin/families" },
    { label: "no payment plan", value: overview.noPayment, href: "/admin/families", warn: overview.noPayment > 0 },
    { label: "no photo consent", value: overview.noConsent, href: "/admin/families", warn: overview.noConsent > 0 },
  ];

  return (
    <>
      <AdminTitle>Assalamu alaikum, {user.staff.displayName.split(" ")[0]}</AdminTitle>

      {isAdmin && !emailConfigured() && process.env.NODE_ENV === "production" ? (
        <Notice tone="action">
          Email isn&apos;t set up yet, so parents can&apos;t get sign-in codes or invites. Add <b>RESEND_API_KEY</b> and <b>EMAIL_FROM</b> to the
          app&apos;s variables in Railway.
        </Notice>
      ) : null}

      {overview.players === 0 && isAdmin ? (
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

      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="flex flex-col-reverse rounded-app border-2 border-line bg-paper p-3">
            <dt className="text-[13px] font-bold text-ink-muted">{s.label}</dt>
            <dd className={`font-display text-[40px] leading-none tabular-nums ${s.warn ? "text-kit-orange" : "text-ink"}`}>{s.value}</dd>
          </Link>
        ))}
      </dl>

      {overview.notInvited > 0 && isAdmin ? (
        <Notice tone="action">
          {overview.notInvited} {overview.notInvited === 1 ? "parent hasn't" : "parents haven't"} been invited yet.{" "}
          <Link href="/admin/families" className="font-bold underline">
            Send invites
          </Link>
        </Notice>
      ) : null}

      <Section
        title="Latest message"
        aside={
          <Link href="/admin/news" className="text-sm font-bold text-grass-text underline">
            Post news
          </Link>
        }
      >
        {latest ? (
          <Link href={`/admin/news/${latest.id}`} className="flex flex-col gap-2">
            <span className="text-[13px] text-ink-muted">
              {latest.topic} · {latest.audience ? latest.audience.join(", ") : "Everyone"} · {shortDay(latest.postedAt)}
            </span>
            <span className="text-base font-bold">{latest.title}</span>
            {latest.requiresAck ? <ReadBar read={latest.readCount} total={latest.audienceCount} /> : null}
          </Link>
        ) : (
          <p className="text-[15px] text-ink-muted">Nothing posted yet.</p>
        )}
      </Section>

      <Section
        title="Next session"
        aside={
          <Link href="/admin/sessions" className="text-sm font-bold text-grass-text underline">
            Sessions
          </Link>
        }
      >
        {next ? (
          <div className="flex flex-col gap-1">
            <span className="text-base font-bold">
              {shortDay(next.startsAt)} · {next.title} {clock(next.startsAt)}
            </span>
            <span className="text-[15px] text-ink-muted">
              {next.ageGroups.join(", ")} · {next.venue}
            </span>
            <span className="text-[15px]">
              <b className="tabular-nums">{next.coming}</b> coming · <b className="tabular-nums">{next.away}</b> away
            </span>
          </div>
        ) : (
          <p className="text-[15px] text-ink-muted">No sessions coming up.</p>
        )}
      </Section>
    </>
  );
}
