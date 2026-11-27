import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { requireParent } from "@/lib/auth/session";
import { loadEvents, upcomingEvents } from "@/lib/community/data";
import { eventWhen } from "@/lib/community/events";
import { asUser } from "@/lib/db";
import { loadCommunitySheets } from "@/lib/plans/data";

/** Home's one-row link to the Community page: the next event, or the newest thing in Coach's corner. Nothing until there's either. */
export async function HomeCommunity({ now }: { now: Date }) {
  const user = await requireParent();
  const [events, sheets] = await asUser(user.id, async (tx) => [upcomingEvents(await loadEvents(tx), now), await loadCommunitySheets(tx, 1)] as const);
  const next = events[0];
  const sheet = sheets[0];
  if (!next && !sheet) return null;
  const line = next ? `${next.title} · ${eventWhen(next.weekly, next.start, next.end)}` : `Coach's corner: ${sheet.title}`;
  return (
    <Link
      href={next ? "/community?from=/news" : "/community?show=corner&from=/news"}
      className="flex min-h-16 items-center gap-3 rounded-app bg-paper px-3.5 py-3 text-ink shadow-card transition-transform active:scale-[0.99]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-web bg-fill text-ink">
        <Users aria-hidden size={24} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-small font-bold">Community</span>
        <span className="text-meta break-words text-ink-muted">{line}</span>
      </span>
      <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
    </Link>
  );
}
