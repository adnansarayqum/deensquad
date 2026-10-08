import Link from "next/link";
import { PageHeader } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import type { AdminSession } from "@/lib/admin/data";
import { clock, shortDay } from "@/lib/dates";

/**
 * The sessions a bulk confirm page is about (date, title, time, groups), with a note on any it will leave alone
 * (`aside(s)`: "Already cancelled", "Has check-ins"), and the hidden ids the form posts back (every one listed: the action
 * skips those again and names them in the notice).
 */
export function BulkSessionList({ sessions, aside, ids }: { sessions: AdminSession[]; aside?: (s: AdminSession) => string | null; ids: readonly string[] }) {
  return (
    <>
      <ul className="flex flex-col divide-y divide-line">
        {sessions.map((s) => {
          const note = aside?.(s) ?? null;
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-[15px]">
              <span className={note ? "text-ink-muted" : ""}>
                <b>{shortDay(s.startsAt)}</b> · {s.title} · {clock(s.startsAt)}–{clock(s.endsAt)} · {s.ageGroups.join(", ")}
              </span>
              {note ? <Pill tone="neutral">{note}</Pill> : null}
            </li>
          );
        })}
      </ul>
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
    </>
  );
}

/** "Cancel 3 sessions?" with the way back; and the one-line note when the picker couldn't change some. */
export function BulkHeader({ title, notYours, skipped }: { title: string; notYours: number; skipped?: string | null }) {
  const notes = [notYours ? `${notYours} of the sessions you ticked ${notYours === 1 ? "isn't" : "aren't"} yours to change and ${notYours === 1 ? "is" : "are"} left out.` : null, skipped].filter(Boolean);
  return <PageHeader back={{ href: "/admin/sessions", label: "Sessions" }} title={title} subtitle={notes.length ? notes.join(" ") : undefined} />;
}

/** When nothing picked can be changed on this page. */
export function NothingToDo({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-app border-2 border-line bg-paper p-4">
      <p className="text-[15px]">{children}</p>
      <Link href="/admin/sessions" className="btn-chunky btn-grass self-start">
        Back to Sessions
      </Link>
    </div>
  );
}

export const count = (n: number) => `${n} ${n === 1 ? "session" : "sessions"}`;
