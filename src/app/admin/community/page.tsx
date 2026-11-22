import type { Metadata } from "next";
import Link from "next/link";
import { FoldCard, PageHeader, Section } from "@/components/admin/bits";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { removeEvent, saveEvent } from "@/lib/community/actions";
import { type CommunityEvent, loadEvents } from "@/lib/community/data";
import { AUDIENCES, AUDIENCE_LABELS, eventWhen, londonInputValue, londonTimeValue, nextOccurrence } from "@/lib/community/events";
import { asUser } from "@/lib/db";
import { loadCommunitySheets } from "@/lib/plans/data";

export const metadata: Metadata = { title: "Community" };

function EventFields({ e }: { e?: CommunityEvent }) {
  const key = e?.id ?? "new";
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      {e ? <input type="hidden" name="id" value={e.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`title-${key}`} className="field-label">
            Name
          </label>
          <input id={`title-${key}`} name="title" defaultValue={e?.title} maxLength={80} placeholder="Brothers' football" className="field" />
        </div>
        <div>
          <label htmlFor={`audience-${key}`} className="field-label">
            Who it&apos;s for
          </label>
          <select id={`audience-${key}`} name="audience" defaultValue={e?.audience ?? "everyone"} className="field">
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABELS[a].replace("For ", "").replace(/^./, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`starts-${key}`} className="field-label">
            Day and start time
          </label>
          <input id={`starts-${key}`} name="startsAt" type="datetime-local" defaultValue={londonInputValue(e?.startsAt ?? null)} className="field" />
        </div>
        <div>
          <label htmlFor={`finishes-${key}`} className="field-label">
            Finishes at <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id={`finishes-${key}`} name="finishes" type="time" defaultValue={londonTimeValue(e?.endsAt ?? null)} className="field" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" name="weekly" defaultChecked={e?.weekly ?? false} className="h-5 w-5 accent-[var(--grass)]" />
          <span className="text-[15px] font-bold">Every week, same day and time</span>
        </label>
        <div>
          <label htmlFor={`until-${key}`} className="field-label">
            Last date <span className="font-normal text-ink-muted">(weekly only; empty: keeps going)</span>
          </label>
          <input id={`until-${key}`} name="repeatUntil" type="date" defaultValue={e?.repeatUntil ?? ""} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor={`venue-${key}`} className="field-label">
          Where <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input id={`venue-${key}`} name="venue" defaultValue={e?.venue ?? ""} maxLength={120} className="field" />
      </div>
      <div>
        <label htmlFor={`details-${key}`} className="field-label">
          Details <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea id={`details-${key}`} name="details" defaultValue={e?.details ?? ""} maxLength={1000} rows={3} className="field" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`join-${key}`} className="field-label">
            How to join <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input id={`join-${key}`} name="howToJoin" defaultValue={e?.howToJoin ?? ""} maxLength={300} placeholder="Just turn up, or who to message" className="field" />
        </div>
        <div>
          <label htmlFor={`link-${key}`} className="field-label">
            Link <span className="font-normal text-ink-muted">(optional, starts with https://)</span>
          </label>
          <input id={`link-${key}`} name="link" type="url" defaultValue={e?.linkUrl ?? ""} maxLength={500} placeholder="https://" className="field" />
        </div>
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" name="active" defaultChecked={e ? e.active : true} className="h-5 w-5 accent-[var(--grass)]" />
        <span className="text-[15px] font-bold">Show to parents</span>
      </label>
    </div>
  );
}

export default async function AdminCommunityPage() {
  const user = await requireAdmin();
  const now = new Date();
  const [events, sheets] = await asUser(user.id, async (tx) => [await loadEvents(tx), await loadCommunitySheets(tx)] as const);
  const rows = events
    .map((e) => ({ e, next: nextOccurrence(e, now) }))
    .sort((a, b) => Number(!a.next) - Number(!b.next) || (a.next?.start ?? a.e.startsAt).getTime() - (b.next?.start ?? b.e.startsAt).getTime());
  return (
    <>
      <PageHeader title="Community" subtitle="What's on and Coach's corner, on the parents' Community page. Parents can read these; only admins post." />

      <FoldCard id="add-event" title="Add an event" open={events.length === 0}>
        <StatefulForm action={saveEvent} submitLabel="Add event" savedMessage="Event added.">
          <EventFields />
        </StatefulForm>
      </FoldCard>

      {rows.map(({ e, next }) => (
        <details key={e.id} className="rounded-app border border-line bg-paper">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2">
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-bold break-words">Edit {e.title}</span>
              <span className="text-[13px] text-ink-muted">{eventWhen(e.weekly, next?.start ?? e.startsAt, next?.end ?? e.endsAt)}</span>
            </span>
            {!e.active ? <Pill tone="neutral">Hidden</Pill> : next ? <Pill tone="done">Showing</Pill> : <Pill tone="neutral">Finished</Pill>}
          </summary>
          <div className="flex flex-col gap-5 border-t border-line p-4">
            <StatefulForm action={saveEvent} submitLabel={`Save ${e.title}`} savedMessage="Saved.">
              <EventFields e={e} />
            </StatefulForm>
            <StatefulForm action={removeEvent} submitLabel={`Remove ${e.title}`} savedMessage="Event removed." className="border-t border-line pt-4">
              <input type="hidden" name="id" value={e.id} />
              <label className="flex min-h-12 items-center gap-3 text-[15px]">
                <input type="checkbox" name="confirm" value="yes" className="h-5 w-5 accent-[var(--grass)]" />
                Yes, remove {e.title} for good
              </label>
            </StatefulForm>
          </div>
        </details>
      ))}

      <Section title="Coach's corner">
        <p className="text-[15px] text-ink-muted">
          {sheets.length === 0
            ? "No practice sheets are shared here yet."
            : sheets.length === 1
              ? "1 practice sheet is shared here."
              : `${sheets.length} practice sheets are shared here.`}{" "}
          Add one, or put an existing sheet in, from Practice sheets.
        </p>
        {sheets.length ? (
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[15px]">
            {sheets.map((s) => (
              <li key={s.id}>{s.title}</li>
            ))}
          </ul>
        ) : null}
        <Link href="/coach/practice" className="mt-3 inline-flex min-h-12 items-center text-[15px] font-bold text-grass-text underline">
          Open Practice sheets
        </Link>
      </Section>
    </>
  );
}
