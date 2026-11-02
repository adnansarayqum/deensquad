import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { Notice, PageHeader } from "@/components/admin/bits";
import { emailNotificationHelp } from "@/lib/admin/actions";
import { HELP_GAP_DAYS, helpedRecently, loadNotificationParents, type NotificationParent } from "@/lib/admin/notifications";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { shortDay } from "@/lib/dates";
import { asUser } from "@/lib/db";
import { dialable, tidyName } from "@/lib/validate";

export const metadata: Metadata = { title: "App notifications" };

type Show = "off" | "on" | "not-in";
const SHOWS: { key: Show; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "on", label: "On" },
  { key: "not-in", label: "Not on the app yet" },
];

/**
 * Who gets the club's app notifications (the owner's request, 2 Nov 2026): parents with them on, parents on the app
 * with them off, and parents not on the app yet, each with their children. Admins can email everyone with them off
 * the steps to turn them on.
 */
export default async function NotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  const user = await requireStaff();
  const flags = await searchParams;
  const show: Show = flags.show === "on" || flags.show === "not-in" ? flags.show : "off";
  const isAdmin = user.staff?.role === "admin";
  const lists = await asUser(user.id, (tx) => loadNotificationParents(tx, coachLimit(user.staff!)));
  const list = show === "on" ? lists.on : show === "not-in" ? lists.notIn : lists.off;
  const count = { off: lists.off.length, on: lists.on.length, "not-in": lists.notIn.length };
  const now = new Date();
  const emailable = lists.off.filter((p) => p.email && !helpedRecently(p, now));
  const recent = lists.off.filter((p) => helpedRecently(p, now)).length;
  const tab = (active: boolean) => `btn-chunky btn-small ${active ? "btn-grass" : "btn-paper"}`;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin", label: "Overview" }} title="App notifications">
        {typeof flags.emailed === "string" ? (
          <Notice>
            Emailed {flags.emailed} {flags.emailed === "1" ? "parent" : "parents"} how to turn notifications on.
            {Number(flags.failed) > 0 ? ` ${flags.failed} not sent: try again later.` : ""}
            {Number(flags.skipped) > 0 ? ` ${flags.skipped} skipped (no email, or emailed in the last week).` : ""}
          </Notice>
        ) : null}
        {flags.help === "nourl" ? <Notice tone="action">Set APP_URL in Railway so the email links to the app.</Notice> : null}
        <nav aria-label="Show" className="flex flex-wrap gap-2">
          {SHOWS.map((s) => (
            <Link key={s.key} href={`/admin/notifications?show=${s.key}`} aria-current={show === s.key ? "page" : undefined} className={tab(show === s.key)}>
              {s.label} ({count[s.key]})
            </Link>
          ))}
        </nav>
      </PageHeader>

      <p className="text-[16px] leading-6">
        {show === "off"
          ? "These parents are on the app but haven't turned notifications on, so they only see club news when they open it. Reminders reach them by email instead."
          : show === "on"
            ? "These parents get a notification when the club posts or messages them."
            : "These parents haven't signed in yet, so they get nothing in the app."}
        {show === "not-in" ? (
          <>
            {" "}
            <Link href="/admin/parents" className="font-bold text-grass-text underline">
              Invite them
            </Link>
          </>
        ) : null}
      </p>

      {show === "off" && isAdmin && lists.off.length > 0 ? (
        // One email to everyone listed here, with the steps for iPhone and Android. Asks first.
        <section id="help" className="flex flex-col gap-2 rounded-app border border-line bg-paper p-4">
          <h2 className="text-[18px] font-bold">Email them how to turn notifications on</h2>
          <p className="text-[15px] text-ink-muted">
            Steps for iPhone and Android, and a link to the app.
            {recent > 0 ? ` ${recent} emailed in the last ${HELP_GAP_DAYS} days will be skipped.` : ` Each parent gets it at most once a week.`}
          </p>
          {emailable.length > 0 ? (
            <form action={emailNotificationHelp} className="flex flex-col gap-2">
              <label className="flex min-h-12 items-center gap-3 text-[15px]">
                <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 shrink-0 accent-[var(--grass)]" />
                Yes, email {emailable.length === 1 ? "this parent" : `these ${emailable.length} parents`}
              </label>
              <button type="submit" className="btn-chunky btn-grass btn-small self-start">
                <Mail aria-hidden size={16} />
                Email {emailable.length === 1 ? "1 parent" : `${emailable.length} parents`}
              </button>
            </form>
          ) : (
            <p className="text-[15px]">Everyone here has been emailed in the last week, or has no email address.</p>
          )}
        </section>
      ) : null}

      <section aria-label={`Parents: ${SHOWS.find((s) => s.key === show)!.label}`} className="rounded-app border border-line bg-paper p-4">
        {list.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Nobody.</p>
        ) : (
          <ul className="flex flex-col">
            {list.map((p) => (
              <ParentRow key={p.id} p={p} showHelp={show === "off"} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ParentRow({ p, showHelp }: { p: NotificationParent; showHelp: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-bold break-words">{tidyName(p.name)}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-[15px]">
          <span>Parent of</span>
          {p.children.map((c, i) => (
            <span key={c.id} className="inline-flex items-center">
              <Link href={`/admin/families/${c.id}`} className="inline-flex min-h-12 items-center font-bold underline">
                {tidyName(c.name)} ({c.group})
              </Link>
              {i < p.children.length - 1 ? "," : null}
            </span>
          ))}
        </p>
        <p className="text-[13px] break-all text-ink-muted">
          {[p.email ?? "No email on file", p.phone].filter(Boolean).join(" · ")}
          {showHelp && p.helpSentAt ? ` · help email sent ${shortDay(p.helpSentAt)}` : ""}
        </p>
      </div>
      {showHelp && p.phone ? (
        <a
          href={`https://wa.me/${dialable(p.phone)}?text=${encodeURIComponent(
            `Assalamu alaikum ${p.firstName}, please turn on notifications in the Deen Squad app so you don't miss club news: open the app and tap Turn on notifications on Home. On iPhone, add the app to your Home Screen first (Share, then Add to Home Screen).`,
          )}`}
          className="btn-chunky btn-paper btn-small"
          aria-label={`WhatsApp ${tidyName(p.name)}`}
        >
          <MessageCircle aria-hidden size={16} />
          WhatsApp
        </a>
      ) : null}
    </li>
  );
}
