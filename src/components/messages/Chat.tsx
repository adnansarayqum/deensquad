import Link from "next/link";
import { CornerDownRight } from "lucide-react";
import { MediaGallery } from "@/components/media/MediaGallery";
import { clock, londonIsoDate, shortDay } from "@/lib/dates";
import type { FamilyChat } from "@/lib/messages/data";

/** "Today", "Yesterday", else "Fri 20 Nov": the line between two days of a chat. */
function dayLabel(at: string, now: Date): string {
  const day = londonIsoDate(new Date(at));
  if (day === londonIsoDate(now)) return "Today";
  if (day === londonIsoDate(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return shortDay(at);
}

/**
 * A family's chat with the club as one timeline, oldest first (messaging like WhatsApp, 26 Nov 2026): a line between
 * days, the viewer's own messages on the right, everyone else's on the left under their name, the time in each
 * bubble. When a message belongs to something (a post it replies to, a "not coming" reason, a subject, another
 * child) a small line above it says so, once per run. "New" marks the first message they hadn't read.
 * A list, so screen readers hear the messages in order; each says who and when.
 */
export function Chat({
  chat,
  now,
  side,
  nameOf = (name) => name,
}: {
  chat: FamilyChat;
  now: Date;
  side: "parent" | "staff";
  /** How a member of staff is named to this reader (parents see "Coach Monju" or a first name). */
  nameOf?: (name: string) => string;
}) {
  const several = chat.children.length > 1;
  return (
    <ol aria-label="Messages" data-chat className="flex flex-col gap-1.5">
      {chat.earlier ? <li className="self-center px-3 py-2 text-center text-[13px] text-ink-muted">{chat.earlier} earlier messages aren&apos;t shown here.</li> : null}
      {chat.messages.map((m, i) => {
        const prev = chat.messages[i - 1];
        const newDay = !prev || londonIsoDate(new Date(prev.at)) !== londonIsoDate(new Date(m.at));
        const newThread = !prev || prev.conversationId !== m.conversationId;
        // What this run of messages belongs to: a post, a "not coming" reason or a subject, and (with several
        // children) which child. A plain conversation in a one-child family needs no line.
        const about = !newThread ? "" : m.context.label ? [several ? m.context.child : null, m.context.label].filter(Boolean).join(" · ") : several ? `About ${m.context.child}` : "";
        const who = m.authorKind === "staff" ? nameOf(m.authorName) : m.authorName;
        const showName = !m.mine && (newDay || prev.mine || prev.authorName !== m.authorName || prev.authorKind !== m.authorKind);
        const last = i === chat.messages.length - 1;
        return (
          <li key={m.id} id={`m-${m.id}`} data-thread={m.conversationId} className={`flex flex-col gap-1 ${m.mine ? "items-end" : "items-start"}`}>
            {newDay ? (
              <p className="my-2 self-center rounded-pill bg-fill px-3 py-1 text-[13px] font-bold text-ink-muted">{dayLabel(m.at, now)}</p>
            ) : null}
            {m.id === chat.firstNew ? (
              <p className="my-1 flex w-full items-center gap-2 text-[13px] font-bold text-kit-orange">
                <span aria-hidden className="h-px flex-1 bg-kit-orange" />
                New
                <span aria-hidden className="h-px flex-1 bg-kit-orange" />
              </p>
            ) : null}
            {about ? (
              <p className={`mt-1.5 flex max-w-[86%] items-start gap-1 px-1 text-[13px] leading-[18px] text-ink-muted ${m.mine ? "text-right" : ""}`}>
                <CornerDownRight aria-hidden size={14} className="mt-0.5 shrink-0" />
                {side === "staff" && m.context.newsId ? (
                  <Link href={`/admin/news/${m.context.newsId}`} className="underline underline-offset-2">
                    {about}
                  </Link>
                ) : (
                  <span>{about}</span>
                )}
              </p>
            ) : null}
            {showName ? <p className="mt-1 px-1 text-[13px] font-bold text-ink">{who}</p> : null}
            {m.media.length ? (
              <div className="w-[82%] max-w-[320px]">
                <MediaGallery items={m.media} label={`${m.mine ? "Your" : `${who}'s`} message`} compact />
              </div>
            ) : null}
            <div
              className={`max-w-[82%] rounded-[18px] px-3.5 pt-2 pb-1.5 text-[16px] leading-[23px] ${
                m.mine ? "rounded-br-md bg-grass-tint text-ink" : "rounded-bl-md bg-paper text-ink shadow-card"
              }`}
            >
              <span className="sr-only">{m.mine ? "You" : who}: </span>
              <p className="break-words whitespace-pre-line">{m.body}</p>
              <p className="text-right text-[13px] leading-[18px] text-ink-muted">
                <span className="sr-only">{dayLabel(m.at, now)}, </span>
                {clock(m.at)}
              </p>
            </div>
            {/* Parents see that the club has read their latest message, so nobody has to type "got it". */}
            {last && chat.seenBy && m.authorKind === "parent" ? <p className="px-1 text-[13px] font-bold text-grass-text">Seen by {nameOf(chat.seenBy)}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
