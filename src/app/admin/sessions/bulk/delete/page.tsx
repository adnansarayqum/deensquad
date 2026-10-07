import type { Metadata } from "next";
import Link from "next/link";
import { BulkHeader, BulkSessionList, NothingToDo, count } from "@/components/admin/BulkSessionList";
import { bulkDeleteSessions } from "@/lib/admin/actions";
import { BULK_MAX, parseIds } from "@/lib/admin/bulk-sessions";
import { loadAdminSessions } from "@/lib/admin/data";
import { lossesSentence, sessionLosses, type SessionLosses } from "@/lib/admin/sessions";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { shortDay } from "@/lib/dates";

export const metadata: Metadata = { title: "Delete sessions" };

// Says what deleting the ticked sessions takes with them. Any session someone has been checked in to is named and
// left out (cancel it instead), as on the single Delete page; the action refuses those again. Sends confirm=yes.
export default async function BulkDelete({ searchParams }: PageProps<"/admin/sessions/bulk/delete">) {
  const user = await requireStaff();
  const ids = parseIds((await searchParams).ids).slice(0, BULK_MAX);
  const { sessions, notYours, losses } = await asUser(user.id, async (tx) => {
    const found = await loadAdminSessions(tx, ids, coachLimit(user.staff));
    const losses = new Map<string, SessionLosses>();
    for (const s of found.sessions) losses.set(s.id, await sessionLosses(tx, s.id));
    return { ...found, losses };
  });
  const todo = sessions.filter((s) => s.attended === 0);
  const kept = sessions.filter((s) => s.attended > 0);
  const skipped = kept.length ? `${kept.length} ${kept.length === 1 ? "has" : "have"} check-ins, so ${kept.length === 1 ? "it" : "they"} can't be deleted (cancel instead).` : null;
  // One sentence for everything that goes with them.
  const total = [...todo].reduce<SessionLosses>(
    (sum, s) => {
      const l = losses.get(s.id)!;
      return { answers: sum.answers + l.answers, plans: sum.plans + l.plans, picked: sum.picked + l.picked, messages: sum.messages + l.messages, attended: 0 };
    },
    { answers: 0, plans: 0, picked: 0, messages: 0, attended: 0 },
  );

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <BulkHeader title={todo.length ? `Delete ${count(todo.length)}?` : "Delete sessions"} notYours={notYours} skipped={skipped} />
      {todo.length === 0 ? (
        <NothingToDo>
          {kept.length ? `Children have been checked in to ${kept.map((s) => shortDay(s.startsAt)).join(", ")}, so ${kept.length === 1 ? "it" : "they"} can't be deleted. Cancel instead.` : "None of the sessions you ticked can be deleted."}
        </NothingToDo>
      ) : (
        <form action={bulkDeleteSessions} className="flex flex-col gap-4 rounded-app border-2 border-line bg-paper p-4">
          <input type="hidden" name="confirm" value="yes" />
          <BulkSessionList sessions={sessions} ids={sessions.map((s) => s.id)} aside={(s) => (s.attended > 0 ? "Has check-ins: kept" : null)} />
          <p className="text-[15px] font-bold">{lossesSentence(total, true)}</p>
          <p className="text-[15px] text-ink-muted">To keep them on the calendar but tell parents they&apos;re off, cancel them instead.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-chunky btn-paper border-kit-orange">
              Delete {count(todo.length)}
            </button>
            <Link href="/admin/sessions" className="btn-chunky btn-grass">
              Keep them
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
