import { postedLabel } from "@/lib/dates";
import type { MessageView } from "@/lib/messages/data";
import { MediaGallery } from "@/components/media/MediaGallery";

/**
 * A conversation's messages, oldest first, as bubbles: the viewer's own on the right ("You"), everyone else's on the
 * left with their name and which side they're on ("Coach" for the club's staff, "Parent" for a parent).
 * A list, so screen readers hear how many messages there are; each says who and when before the text.
 */
export function Thread({ messages, now }: { messages: MessageView[]; now: Date }) {
  if (messages.length === 0) return <p className="text-[15px] text-ink-muted">No messages yet.</p>;
  return (
    <ol aria-label="Messages" className="flex flex-col gap-3">
      {messages.map((m) => (
        <li key={m.id} className={`flex flex-col gap-1 ${m.mine ? "items-end" : "items-start"}`}>
          <p className="flex flex-wrap items-center gap-x-2 px-1 text-[13px] text-ink-muted">
            <span className="font-bold text-ink">{m.mine ? "You" : m.authorName}</span>
            {m.mine ? null : (
              <span className="rounded-pill border border-line bg-paper px-2 py-0.5 text-label uppercase">{m.authorKind === "staff" ? "Coach" : "Parent"}</span>
            )}
            <span>{postedLabel(m.at, now)}</span>
          </p>
          {m.media.length ? (
            <div className="w-[85%] max-w-[320px]">
              <MediaGallery items={m.media} label={`${m.mine ? "Your" : `${m.authorName}'s`} message`} compact />
            </div>
          ) : null}
          <p
            className={`max-w-[85%] rounded-app border-2 px-3.5 py-2.5 text-[15px] leading-[22px] break-words whitespace-pre-line ${
              m.mine ? "border-grass bg-grass-tint text-ink" : "border-line bg-paper text-ink"
            }`}
          >
            {m.body}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** The club message a reply thread is about, at the top so the replies have their context. Long ones fold. */
export function QuotedNews({ news, now }: { news: { title: string; body: string; postedBy: string | null; postedAt: string }; now: Date }) {
  const long = news.body.length > 240;
  const meta = [news.postedBy, postedLabel(news.postedAt, now)].filter(Boolean).join(" · ");
  return (
    <section aria-label="The message this is about" className="flex flex-col gap-1.5 rounded-app border-2 border-line border-l-[6px] border-l-grass bg-paper px-3.5 py-3">
      <p className="text-label text-ink-muted uppercase">Replying to</p>
      <h2 className="text-[16px] leading-[22px] font-extrabold">{news.title}</h2>
      {long ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-[15px] leading-[22px]">
            <span className="group-open:hidden">{news.body.slice(0, 220).trimEnd()}… </span>
            <span className="inline-flex min-h-12 items-center font-bold text-grass-text underline group-open:hidden">Show all</span>
          </summary>
          <p className="text-[15px] leading-[22px] whitespace-pre-line">{news.body}</p>
        </details>
      ) : (
        <p className="text-[15px] leading-[22px] whitespace-pre-line">{news.body}</p>
      )}
      {meta ? <p className="text-[13px] text-ink-muted">{meta}</p> : null}
    </section>
  );
}
