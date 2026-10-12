import { postedLabel } from "@/lib/dates";
import type { MessageView } from "@/lib/messages/data";

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
