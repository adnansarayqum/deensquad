import type { Queryable } from "../db/types";
import { addSessionRun, addedSentence, cancelSession, postSessionNotice } from "../admin/sessions";
import { insertNews } from "../admin/news";
import type { AddSessionsPayload, CancelPayload, DraftKind, NewsPayload } from "./tools";

// What happens when the admin taps Confirm on one of the assistant's drafts: the same functions the Sessions and
// News pages use, on the payload the server checked and kept (never anything sent back from the browser). The draft
// is claimed first in the same transaction, so a double tap or a second tab does it once; a failure rolls the claim
// back too. Drafts older than a day are refused (the club's data may have moved on).

export const DRAFT_HOURS = 24;

export type Applied =
  | { ok: true; message: string; link: string | null; chase: string | null; requiresAck: boolean }
  | { ok: false; message: string };

export async function applyDraft(tx: Queryable, id: string, staffId: string): Promise<Applied> {
  const [draft] = await tx.query<{ kind: DraftKind; payload: unknown }>(
    `update assistant_actions set done_at = now()
     where id = $1 and staff_id = $2 and done_at is null and created_at > now() - make_interval(hours => $3)
     returning kind, payload`,
    [id, staffId, DRAFT_HOURS],
  );
  if (!draft) return { ok: false, message: "That draft has already been done, dismissed or is over a day old. Ask again." };
  const payload = (typeof draft.payload === "string" ? JSON.parse(draft.payload) : draft.payload) as Record<string, unknown>;
  const done = async (message: string, link: string | null, chase: string | null = null, requiresAck = false): Promise<Applied> => {
    await tx.query(`update assistant_actions set result = $2 where id = $1`, [id, message]);
    return { ok: true, message, link, chase, requiresAck };
  };

  if (draft.kind === "add_sessions") {
    const p = payload as unknown as AddSessionsPayload;
    const result = await addSessionRun(tx, {
      kind: p.kind,
      title: p.title,
      venue: p.venue,
      groups: p.groups,
      times: p.times.map((t) => ({ start: new Date(t.start), end: new Date(t.end) })),
      arriveBy: p.arriveBy,
      kit: p.kit,
      prayerNote: null,
      notes: p.notes,
    });
    return done(addedSentence(result), "/admin/sessions");
  }

  if (draft.kind === "cancel_session") {
    const p = payload as unknown as CancelPayload;
    const changed = await cancelSession(tx, p.sessionId, true, null, p.reason);
    if (!changed) {
      await tx.query(`update assistant_actions set result = 'Already cancelled or gone.' where id = $1`, [id]);
      return { ok: false, message: "That session is already cancelled, or has been deleted." };
    }
    const news = p.tell ? await postSessionNotice(tx, p.sessionId, "cancelled", staffId) : null;
    return done(news ? "Cancelled. The families have been told." : "Cancelled. The families haven't been told.", "/admin/sessions", news, Boolean(news));
  }

  const p = payload as unknown as NewsPayload;
  const newsId = await insertNews(tx, {
    topic: p.topic,
    title: p.title,
    body: p.body,
    audience: p.groups,
    requiresAck: p.requiresAck,
    postedBy: staffId,
    squadSession: null,
    children: null,
  });
  return done("Posted to parents.", `/admin/news/${newsId}`, newsId, p.requiresAck);
}

export async function dismissDraft(tx: Queryable, id: string, staffId: string): Promise<void> {
  await tx.query(`update assistant_actions set done_at = now(), dismissed = true, result = 'Dismissed.' where id = $1 and staff_id = $2 and done_at is null`, [id, staffId]);
}
