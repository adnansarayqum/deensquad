import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, ReadBar, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { postNews } from "@/lib/admin/actions";
import { audienceLabel, loadNewsList } from "@/lib/admin/data";
import { loadNewsChildren } from "@/lib/admin/news";
import { NewsAudience } from "@/components/admin/NewsAudience";
import { TOPICS } from "@/lib/admin/topics";
import { WritingHelp } from "@/components/writing/WritingHelp";
import { aiConfigured } from "@/lib/ai/claude";
import { coachLimit, isGroupCoach, requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { postedLabel } from "@/lib/dates";

export const metadata: Metadata = { title: "News" };

export default async function AdminNewsPage() {
  const user = await requireStaff();
  const limited = isGroupCoach(user.staff);
  const myGroups = staffGroups(user.staff);
  const mine = coachLimit(user.staff);
  const { news, children } = await asUser(user.id, async (tx) => ({ news: await loadNewsList(tx, 50, mine), children: await loadNewsChildren(tx, mine) }));
  const now = new Date();

  return (
    <>
      <PageHeader title="News" subtitle="Post a message and see who has read it." />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Section title="Post a message">
          <StatefulForm action={postNews} submitLabel="Post to parents" pendingLabel="Posting…">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div>
                <label htmlFor="topic" className="field-label">
                  Topic
                </label>
                <select id="topic" name="topic" className="field" defaultValue="General">
                  {TOPICS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="title" className="field-label">
                  Headline
                </label>
                <input id="title" name="title" maxLength={120} className="field" placeholder="New away kit: sizes needed by Friday" />
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
            <NewsAudience limited={limited} myGroups={myGroups} list={children} />
            <label className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" name="requiresAck" defaultChecked className="h-5 w-5 accent-[var(--grass)]" />
              <span>
                <b>Ask parents to tap &ldquo;I&apos;ve read this&rdquo;</b> so you can see who has read it
              </span>
            </label>
          </StatefulForm>
        </Section>

        <section aria-labelledby="posted" className="flex flex-col gap-2">
          <h2 id="posted" className="text-label text-ink-muted uppercase">
            Posted
          </h2>
          {news.length === 0 ? <p className="text-[15px] text-ink-muted">Nothing posted yet.</p> : null}
          {news.map((n) => (
            <Link key={n.id} href={`/admin/news/${n.id}`} className="flex flex-col gap-2 rounded-app border-2 border-line bg-paper px-4 py-3">
              <span className="text-[13px] text-ink-muted">
                {n.topic} · {audienceLabel(n)} · {postedLabel(n.postedAt, now)}
                {n.postedBy ? ` · ${n.postedBy}` : ""}
              </span>
              <span className="text-base font-bold">{n.title}</span>
              {n.requiresAck ? <ReadBar read={n.readCount} total={n.audienceCount} groupsOnly={n.groupsOnly} /> : null}
            </Link>
          ))}
        </section>
      </div>
    </>
  );
}
