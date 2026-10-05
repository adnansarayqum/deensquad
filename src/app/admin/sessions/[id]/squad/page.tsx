import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/admin/bits";
import { SquadPicker } from "@/components/admin/SquadPicker";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { WritingHelp } from "@/components/writing/WritingHelp";
import { postNews } from "@/lib/admin/actions";
import { TOPICS } from "@/lib/admin/topics";
import { aiConfigured } from "@/lib/ai/claude";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { loadSquad } from "@/lib/squads/squads";

export const metadata: Metadata = { title: "Squad" };

// Pick who plays in a tournament (or any session), see who has confirmed, and message only their parents.
// Admins for any session; a group coach for sessions whose groups are all theirs (404 otherwise).
export default async function SquadPage({ params }: PageProps<"/admin/sessions/[id]/squad">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const view = await asUser(user.id, (tx) => loadSquad(tx, id, coachLimit(user.staff)));
  if (!view) notFound();
  const { session, children, picked } = view;
  const squad = children.filter((c) => c.picked);
  const confirmed = squad.filter((c) => c.answer === "coming").length;
  const declined = squad.filter((c) => c.answer === "away").length;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <Link href="/admin/sessions" className="inline-flex min-h-11 items-center text-sm font-bold text-grass-text">
        ← Sessions
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">{session.title} squad</h1>
        <p className="text-[15px] text-ink-muted">
          {shortDay(session.startsAt)} · {clock(session.startsAt)}–{clock(session.endsAt)} · {session.venue} · {session.ageGroups.join(", ")}
        </p>
        {picked > 0 ? (
          <p className="text-[15px] font-bold">
            {picked} picked · {confirmed} confirmed · {declined} can&apos;t play · {picked - confirmed - declined} not answered
          </p>
        ) : null}
      </div>

      <Section title="Pick the squad">
        <SquadPicker sessionId={session.id} title={session.title} list={children} />
      </Section>

      <Section title="Message the squad">
        {picked === 0 ? (
          <p className="text-[15px] text-ink-muted">Save a squad first. The message then goes only to the parents of the children picked.</p>
        ) : (
          <StatefulForm action={postNews} submitLabel="Send to the squad's parents" pendingLabel="Sending…">
            <input type="hidden" name="squadSession" value={session.id} />
            <p className="text-sm text-ink-muted">
              Goes to the parents of the {picked} {picked === 1 ? "child" : "children"} picked, and to any you add to the squad later. Reminders
              follow as for club news.
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div>
                <label htmlFor="topic" className="field-label">
                  Topic
                </label>
                <select id="topic" name="topic" className="field" defaultValue="Matches">
                  {TOPICS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="title" className="field-label">
                  Headline
                </label>
                <input id="title" name="title" maxLength={120} className="field" placeholder={`${session.title}: meet at 9am`} />
              </div>
            </div>
            <div>
              <label htmlFor="body" className="field-label">
                Message
              </label>
              <textarea id="body" name="body" rows={5} maxLength={4000} className="field" />
              <div className="mt-2">
                <WritingHelp bodyId="body" titleId="title" kind="news" ai={aiConfigured()} />
              </div>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" name="requiresAck" defaultChecked className="h-5 w-5 accent-[var(--grass)]" />
              <span>
                <b>Ask parents to tap &ldquo;I&apos;ve read this&rdquo;</b> so you can see who has read it
              </span>
            </label>
          </StatefulForm>
        )}
      </Section>
    </div>
  );
}
