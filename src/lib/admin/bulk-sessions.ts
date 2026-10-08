import { londonDate, londonTime, shortDay } from "../dates";
import type { Queryable } from "../db/types";
import type { AgeGroup, SessionKind } from "../domain";
import { loadAdminSessions, type AdminSession } from "./data";
import { cancelSession, editSession, postSessionNotice, removeSession, type SessionEdit } from "./sessions";

// Bulk changes from Admin → Sessions: the ticked sessions, edited, cancelled, restored or deleted together.
// Each goes through the single-session function (editSession, cancelSession, removeSession, postSessionNotice),
// so the rules are the same: a group coach changes only sessions whose groups are all theirs (`mine`), answers
// stay when the time moves, a session anyone was checked in to is never deleted. The ids travel as a
// comma-separated list in the confirm page's `?ids=` (put there by `openBulk` from the ticked boxes) and back
// as hidden fields; the server re-checks every id against scope each time and names the rest as skipped.

/** The most sessions one bulk action takes, so a confirm page and its notices stay readable. */
export const BULK_MAX = 100;

export type BulkAction = "edit" | "cancel" | "restore" | "delete";
export const BULK_ACTIONS: readonly BulkAction[] = ["edit", "cancel", "restore", "delete"];
export const isBulkAction = (v: unknown): v is BulkAction => typeof v === "string" && (BULK_ACTIONS as readonly string[]).includes(v);

/** `?ids=a,b,c` → unique valid ids, in the order given. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  for (const v of list) if (typeof v === "string" && UUID.test(v.trim())) seen.add(v.trim().toLowerCase());
  return [...seen];
}

/** "Fri 9 Oct" for a session, used when naming skipped ones. */
const dayOf = (s: Pick<AdminSession, "startsAt">) => shortDay(s.startsAt);

// Editing ------------------------------------------------------------------------

/** What the bulk edit form filled in: a field left blank is undefined and keeps each session's own value. */
export type BulkEditPatch = {
  kind?: SessionKind;
  title?: string;
  venue?: string;
  /** London clock time, applied on each session's own day. */
  start?: { hour: number; minute: number };
  end?: { hour: number; minute: number };
  arriveBy?: string;
  kit?: string;
  prayerNote?: string;
  notes?: string;
  /** Only when "Change groups" was ticked. */
  groups?: AgeGroup[];
};

export const patchIsEmpty = (p: BulkEditPatch) => Object.values(p).every((v) => v === undefined);

/** The same clock time on the London day `at` falls on. */
function atClock(at: string, time: { hour: number; minute: number }): Date {
  const d = londonDate(new Date(at));
  return londonTime(d.year, d.month, d.day, time.hour, time.minute);
}

/** A session's details with the patch laid over them. */
export function applyPatch(s: AdminSession, p: BulkEditPatch): SessionEdit {
  return {
    kind: p.kind ?? s.kind,
    title: p.title ?? s.title,
    venue: p.venue ?? s.venue,
    groups: p.groups ?? s.ageGroups,
    start: p.start ? atClock(s.startsAt, p.start) : new Date(s.startsAt),
    end: p.end ? atClock(s.endsAt, p.end) : new Date(s.endsAt),
    arriveBy: p.arriveBy ?? s.arriveBy,
    kit: p.kit ?? s.kit,
    prayerNote: p.prayerNote ?? s.prayerNote,
    notes: p.notes ?? s.notes,
  };
}

export type Skipped = { id: string; day: string; title: string; why: "not_yours" | "already" | "checked_in" | "times" | "failed" };

export type BulkResult = {
  /** Ids changed. */
  done: string[];
  skipped: Skipped[];
  /** News posted (one per session told), to chase after the response. */
  news: string[];
  /** Bulk edit: children taken out of squads because their group came off. */
  squadRemoved: number;
};

const empty = (): BulkResult => ({ done: [], skipped: [], news: [], squadRemoved: 0 });

/** Sessions the picker can't change are reported, not changed. */
function notYours(result: BulkResult, n: number) {
  for (let i = 0; i < n; i++) result.skipped.push({ id: "", day: "", title: "", why: "not_yours" });
}

/**
 * Applies the filled-in fields to every session, in one transaction (all or nothing: an edit that fails rolls the
 * lot back, which `editSession` only does when the database does). Sessions whose finish would come before their
 * start after the change are skipped and named.
 */
export async function bulkEdit(
  tx: Queryable,
  ids: readonly string[],
  patch: BulkEditPatch,
  mine: readonly AgeGroup[] | null,
  tell: boolean,
  staffId: string,
): Promise<BulkResult> {
  const result = empty();
  const { sessions, notYours: n } = await loadAdminSessions(tx, ids.slice(0, BULK_MAX), mine);
  notYours(result, n);
  for (const s of sessions) {
    const edit = applyPatch(s, patch);
    if (edit.end <= edit.start) {
      result.skipped.push({ id: s.id, day: dayOf(s), title: s.title, why: "times" });
      continue;
    }
    const saved = await editSession(tx, s.id, edit, mine);
    if (!saved.ok) {
      result.skipped.push({ id: s.id, day: dayOf(s), title: s.title, why: "not_yours" });
      continue;
    }
    result.done.push(s.id);
    result.squadRemoved += saved.squadRemoved;
    if (tell) {
      const news = await postSessionNotice(tx, s.id, "changed", staffId);
      if (news) result.news.push(news);
    }
  }
  return result;
}

// Cancelling and restoring --------------------------------------------------------

/**
 * Cancels (or restores) every session, each in its own savepoint so one that fails is reported and the rest still
 * go. Already cancelled (or not cancelled) ones are skipped and named. With `tell`, posts the urgent notice per
 * session, as the single Cancel page does.
 */
export async function bulkCancel(
  tx: Queryable,
  ids: readonly string[],
  cancel: boolean,
  mine: readonly AgeGroup[] | null,
  reason: string | null,
  tell: boolean,
  staffId: string,
): Promise<BulkResult> {
  const result = empty();
  const { sessions, notYours: n } = await loadAdminSessions(tx, ids.slice(0, BULK_MAX), mine);
  notYours(result, n);
  for (const s of sessions) {
    if (s.cancelled === cancel) {
      result.skipped.push({ id: s.id, day: dayOf(s), title: s.title, why: "already" });
      continue;
    }
    try {
      const news = await tx.savepoint(async (sp) => {
        const flipped = await cancelSession(sp, s.id, cancel, mine, cancel ? reason : null);
        if (!flipped) throw new Error("not flipped");
        return tell ? postSessionNotice(sp, s.id, cancel ? "cancelled" : "restored", staffId) : null;
      });
      result.done.push(s.id);
      if (news) result.news.push(news);
    } catch (error) {
      console.error(`bulk ${cancel ? "cancel" : "restore"} of ${s.id} failed`, error);
      result.skipped.push({ id: s.id, day: dayOf(s), title: s.title, why: "failed" });
    }
  }
  return result;
}

// Deleting -------------------------------------------------------------------------

/**
 * Deletes every session nobody has been checked in to (the rest are kept and named), each in its own savepoint.
 * Plan files go with each, as on the single Delete page.
 */
export async function bulkDelete(tx: Queryable, ids: readonly string[], mine: readonly AgeGroup[] | null): Promise<BulkResult> {
  const result = empty();
  const { sessions, notYours: n } = await loadAdminSessions(tx, ids.slice(0, BULK_MAX), mine);
  notYours(result, n);
  for (const s of sessions) {
    if (s.attended > 0) {
      result.skipped.push({ id: s.id, day: dayOf(s), title: s.title, why: "checked_in" });
      continue;
    }
    try {
      const gone = await tx.savepoint((sp) => removeSession(sp, s.id, mine));
      // Not gone: someone was checked in since the page loaded (or it's no longer this coach's).
      if (gone) result.done.push(s.id);
      else result.skipped.push({ id: s.id, day: dayOf(s), title: s.title, why: "checked_in" });
    } catch (error) {
      console.error(`bulk delete of ${s.id} failed`, error);
      result.skipped.push({ id: s.id, day: dayOf(s), title: s.title, why: "failed" });
    }
  }
  return result;
}

// Telling the admin what happened ---------------------------------------------------

/** The notice travels back to /admin/sessions in the query string: `?bulk=cancelled&done=6&skipped=2&told=1&which=…`. */
export function bulkResultQuery(action: BulkAction, result: BulkResult): string {
  const q = new URLSearchParams({ bulk: action, done: String(result.done.length) });
  if (result.skipped.length) {
    q.set("skipped", String(result.skipped.length));
    // The first few named, by day ("not your groups" ones have no day); for a delete, the ones kept for their check-ins.
    const named = result.skipped.filter((s) => s.day && (action !== "delete" || s.why === "checked_in")).slice(0, 5);
    if (named.length) q.set("which", named.map((s) => s.day).join(", "));
    const kept = result.skipped.filter((s) => s.why === "checked_in").length;
    if (kept) q.set("kept", String(kept));
    const yours = result.skipped.filter((s) => s.why === "not_yours").length;
    if (yours) q.set("yours", String(yours));
  }
  if (result.news.length) q.set("told", "1");
  if (result.squadRemoved) q.set("squad", String(result.squadRemoved));
  return q.toString();
}

const plural = (n: number, one = "session", many = "sessions") => `${n} ${n === 1 ? one : many}`;

/**
 * "Updated 6 sessions. 2 skipped (9 Oct, 16 Oct). The families have been told." — from the query `bulkResultQuery`
 * wrote, read by the Sessions page. Null when there's no bulk notice to show.
 */
export function bulkNotice(params: Record<string, string | string[] | undefined>): string | null {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : null);
  const action = get("bulk");
  if (action === "none") return "Tick the sessions you want to change first.";
  if (action === "toomany") return `Choose up to ${BULK_MAX} sessions at a time.`;
  if (!isBulkAction(action)) return null;
  const done = Number(get("done") ?? 0);
  const skipped = Number(get("skipped") ?? 0);
  const kept = Number(get("kept") ?? 0);
  const yours = Number(get("yours") ?? 0);
  const which = get("which");
  const verb = { edit: "Updated", cancel: "Cancelled", restore: "Put back on", delete: "Deleted" }[action];
  const parts = [done ? (action === "restore" ? `Put ${plural(done)} back on.` : `${verb} ${plural(done)}.`) : `No sessions ${verb.toLowerCase()}.`];
  const named = which ? ` (${which})` : "";
  if (action === "delete" && kept) parts.push(`${kept} kept${named}: children have been checked in.`);
  const otherSkipped = skipped - (action === "delete" ? kept : 0) - yours;
  if (otherSkipped > 0) {
    const why = { cancel: "already cancelled", restore: "not cancelled", edit: "the finish time would be before the start", delete: "couldn't be deleted" }[action];
    parts.push(`${otherSkipped} skipped${action === "delete" ? "" : named}: ${why}.`);
  }
  if (yours) parts.push(`${yours} skipped: not your groups.`);
  const squad = Number(get("squad") ?? 0);
  if (squad) parts.push(`${plural(squad, "child", "children")} no longer in the groups came out of a squad.`);
  if (get("told")) parts.push("The families have been told.");
  return parts.join(" ");
}
