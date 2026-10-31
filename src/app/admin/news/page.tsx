import type { Metadata } from "next";
import Link from "next/link";
import { FoldCard, Notice, PageHeader, ReadBar } from "@/components/admin/bits";
import { UUID } from "@/lib/auth/tokens";
import { NewsComposeForm } from "@/components/admin/NewsComposeForm";
import { postNews } from "@/lib/admin/actions";
import { audienceLabel, loadNewsList } from "@/lib/admin/data";
import { loadNewsChildren } from "@/lib/admin/news";
import { NewsAudience } from "@/components/admin/NewsAudience";
import { NewsReplyOptions } from "@/components/admin/NewsReplyOptions";
import { MediaPicker } from "@/components/media/MediaPicker";
import { PHOTO_CONSENT_HINT } from "@/lib/media/limits";
import { TOPICS } from "@/lib/admin/topics";
import { WritingHelp } from "@/components/writing/WritingHelp";
import { aiConfigured } from "@/lib/ai/claude";
import { coachLimit, isGroupCoach, requireStaff, staffGroups } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, postedLabel, shortDay } from "@/lib/dates";
import { iso } from "@/lib/db/types";

export const metadata: Metadata = { title: "News" };

export default async function AdminNewsPage({ searchParams }: PageProps<"/admin/news">) {
  const user = await requireStaff();
  const params = await searchParams;
  const askAbout = params.comingTo;
  const comingTo = typeof askAbout === "string" ? askAbout : "";
  // "Message who came" from a past session (the children checked in there), or "Message several families" from
  // Messages: one post to the families chosen, replies on, each reply a private conversation as before.
  const cameTo = typeof params.cameTo === "string" && UUID.test(params.cameTo) ? params.cameTo : "";
  const toChildren = params.to === "children" || Boolean(cameTo);
  const limited = isGroupCoach(user.staff);
  const myGroups = staffGroups(user.staff);
  const mine = coachLimit(user.staff);
  const { news, children, sessions, came } = await asUser(user.id, async (tx) => ({
    news: await loadNewsList(tx, 50, mine),
    children: await loadNewsChildren(tx, mine),
    // Sessions in the next three weeks that "Ask who's coming" can be about (a group coach's own groups).
    sessions: await tx.query<{ id: string; title: string; starts_at: Date; age_groups: string[] }>(
      `select id, title, starts_at, age_groups::text[] as age_groups from sessions
       where ends_at > now() and starts_at < now() + interval '21 days' and cancelled_at is null
         and ($1::text[] is null or age_groups && $1::text[]::age_group[])
       order by starts_at limit 12`,
      [mine ? [...mine] : null],
    ),
    came: cameTo
      ? (
          await tx.query<{ title: string; starts_at: Date; ids: string[] }>(
            `select s.title, s.starts_at, coalesce(array_agg(a.player_id::text) filter (where a.player_id is not null), '{}') as ids
             from sessions s left join attendance a on a.session_id = s.id
             where s.id = $1 group by s.id`,
            [cameTo],
          )
        )[0] ?? null
      : null,
  }));
  const now = new Date();
  // Only children this member of staff can message (their groups); anyone else checked in is left out.
  const listed = new Set(children.map((c) => c.id));
  const cameIds = came ? came.ids.filter((id) => listed.has(id)) : [];
  // From a session's "Ask who's coming": the post starts written, ready to check and send.
  const asked = sessions.find((s) => s.id === comingTo);
  const askTitle = asked ? `Who's coming to ${asked.title.toLowerCase() === "training" ? "training" : asked.title} on ${shortDay(iso(asked.starts_at))}?` : undefined;

  return (
    <>
      <PageHeader title="News" subtitle="Post a message and see who has read it." />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <FoldCard id="post-message" title="Post a message" open={news.length === 0 || Boolean(comingTo) || toChildren}>
          <NewsComposeForm action={postNews}>
            {came ? (
              <Notice>
                {cameIds.length
                  ? `Chosen: the ${cameIds.length === 1 ? "child" : `${cameIds.length} children`} checked in at ${came.title}, ${shortDay(iso(came.starts_at))}. Add or take anyone out under "Who is it for?".`
                  : `Nobody you can message was checked in at ${came.title}, ${shortDay(iso(came.starts_at))}. Choose the children under "Who is it for?".`}
              </Notice>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div>
                <label htmlFor="topic" className="field-label">
                  Topic
                </label>
                <select id="topic" name="topic" className="field" defaultValue={asked ? "Training" : "General"}>
                  {TOPICS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="title" className="field-label">
                  Headline
                </label>
                <input id="title" name="title" maxLength={120} className="field" placeholder="New away kit: sizes needed by Friday" defaultValue={askTitle} />
              </div>
            </div>
            <div>
              <label htmlFor="body" className="field-label">
                Message
              </label>
              <textarea id="body" name="body" rows={5} maxLength={4000} className="field" defaultValue={asked ? "Please tap Coming or Not coming for each of your children." : undefined} />
              <div className="mt-2">
                <WritingHelp bodyId="body" titleId="title" kind="news" ai={aiConfigured()} />
              </div>
            </div>
            <MediaPicker hint={PHOTO_CONSENT_HINT} />
            <NewsAudience key={cameTo || (toChildren ? "children" : "all")} limited={limited} myGroups={myGroups} list={children} initial={cameIds} startOnChildren={toChildren} />
            <NewsReplyOptions
              comingTo={comingTo}
              replies={toChildren}
              sessions={sessions.map((s) => ({
                id: s.id,
                label: `${shortDay(iso(s.starts_at))} · ${s.title} · ${clock(iso(s.starts_at))} · ${s.age_groups.join(", ")}`,
              }))}
            />
            <label className="flex min-h-11 items-center gap-3 text-[15px]">
              <input type="checkbox" name="requiresAck" defaultChecked className="h-5 w-5 accent-[var(--grass)]" />
              <span>
                <b>Ask parents to tap &ldquo;I&apos;ve read this&rdquo;</b> so you can see who has read it
              </span>
            </label>
          </NewsComposeForm>
        </FoldCard>

        <section aria-labelledby="posted" className="flex flex-col gap-2">
          <h2 id="posted" className="text-[13px] font-bold text-ink-muted">
            Posted
          </h2>
          {news.length === 0 ? <p className="text-[15px] text-ink-muted">Nothing posted yet.</p> : null}
          {news.map((n) => (
            <Link key={n.id} href={`/admin/news/${n.id}`} className="flex flex-col gap-2 rounded-app border border-line bg-paper px-4 py-3">
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
