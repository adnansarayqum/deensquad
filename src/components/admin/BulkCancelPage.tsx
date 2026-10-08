import Link from "next/link";
import { BulkHeader, BulkSessionList, NothingToDo, count } from "@/components/admin/BulkSessionList";
import { bulkCancelSessions } from "@/lib/admin/actions";
import { BULK_MAX, parseIds } from "@/lib/admin/bulk-sessions";
import { loadAdminSessions } from "@/lib/admin/data";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

/**
 * Bulk cancel (one optional reason for all) or restore (the mirror) of the ticked sessions. Already cancelled (or
 * not cancelled) ones are listed and left out. "Tell the families now" is ticked, as on the single Cancel page.
 * A plain form; the ids come from `?ids=` and go back as hidden fields.
 */
export async function BulkCancelPage({ restore, ids: raw }: { restore: boolean; ids: unknown }) {
  const user = await requireStaff();
  const ids = parseIds(raw).slice(0, BULK_MAX);
  const { sessions, notYours } = await asUser(user.id, (tx) => loadAdminSessions(tx, ids, coachLimit(user.staff)));
  const todo = sessions.filter((s) => s.cancelled === restore);
  const already = sessions.length - todo.length;
  const verb = restore ? "Put back on" : "Cancel";
  const heading = todo.length ? (restore ? `Put ${count(todo.length)} back on?` : `Cancel ${count(todo.length)}?`) : verb;
  const skipped = already ? `${already} ${already === 1 ? "is" : "are"} ${restore ? "not cancelled" : "already cancelled"} and will be left as ${already === 1 ? "it is" : "they are"}.` : null;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <BulkHeader title={heading} notYours={notYours} skipped={skipped} />
      {todo.length === 0 ? (
        <NothingToDo>{restore ? "None of the sessions you ticked is cancelled." : "Every session you ticked is already cancelled."}</NothingToDo>
      ) : (
        <form action={bulkCancelSessions} className="flex flex-col gap-4 rounded-app border-2 border-line bg-paper p-4">
          <input type="hidden" name="cancel" value={restore ? "no" : "yes"} />
          <BulkSessionList sessions={sessions} ids={sessions.map((s) => s.id)} aside={(s) => (s.cancelled === restore ? null : restore ? "Not cancelled" : "Already cancelled")} />
          {restore ? null : (
            <div>
              <label htmlFor="reason" className="field-label">
                Reason <span className="font-normal text-ink-muted">(optional, parents see it; the same for every session)</span>
              </label>
              <input id="reason" name="reason" maxLength={120} placeholder="Half term" className="field" />
            </div>
          )}
          <label className="flex min-h-12 items-center gap-3 text-[15px]">
            <input type="checkbox" name="notify" defaultChecked className="h-5 w-5 accent-[var(--grass)]" />
            <span>
              <b>Tell the families now.</b> Posts one message in club news per session for the families it reaches, with an app notification and an
              email straight away (after 8am if it&apos;s late at night).
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-chunky btn-grass">
              {restore ? `Put ${count(todo.length)} back on` : `Cancel ${count(todo.length)}`}
            </button>
            <Link href="/admin/sessions" className="btn-chunky btn-paper">
              {restore ? "Leave them cancelled" : "Keep them on"}
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
