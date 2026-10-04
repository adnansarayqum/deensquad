import type { Metadata } from "next";
import Link from "next/link";
import { AdminTitle, ReadBar, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { postNews } from "@/lib/admin/actions";
import { loadNewsList } from "@/lib/admin/data";
import { TOPICS } from "@/lib/admin/topics";
import { requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { postedLabel } from "@/lib/dates";
import { AGE_GROUPS } from "@/lib/domain";

export const metadata: Metadata = { title: "News" };

export default async function AdminNewsPage() {
  const user = await requireStaff();
  const news = await asUser(user.id, (tx) => loadNewsList(tx));
  const now = new Date();

  return (
    <>
      <AdminTitle>News</AdminTitle>

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
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="field-label">Who is it for?</legend>
            <label className="flex min-h-11 items-center gap-3 text-[15px] font-bold">
              <input type="radio" name="audience" value="all" defaultChecked className="h-5 w-5 accent-[var(--grass)]" />
              Every family
            </label>
            <label className="flex min-h-11 items-center gap-3 text-[15px] font-bold">
              <input type="radio" name="audience" value="groups" className="h-5 w-5 accent-[var(--grass)]" />
              Only these age groups:
            </label>
            <div className="flex flex-wrap gap-2 pl-8">
              {AGE_GROUPS.map((g) => (
                <label key={g} className="flex min-h-11 items-center gap-2 rounded-pill border-2 border-line bg-paper px-3.5 has-[:checked]:border-grass has-[:checked]:bg-grass-tint">
                  <input type="checkbox" name="groups" value={g} className="h-4 w-4 accent-[var(--grass)]" />
                  <span className="text-sm font-extrabold">{g}</span>
                </label>
              ))}
            </div>
          </fieldset>
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
              {n.topic} · {n.audience ? n.audience.join(", ") : "Every family"} · {postedLabel(n.postedAt, now)}
              {n.postedBy ? ` · ${n.postedBy}` : ""}
            </span>
            <span className="text-base font-bold">{n.title}</span>
            {n.requiresAck ? <ReadBar read={n.readCount} total={n.audienceCount} /> : null}
          </Link>
        ))}
      </section>
    </>
  );
}
