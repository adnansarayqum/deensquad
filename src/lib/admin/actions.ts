"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { coachLimit, isGroupCoach, requireAdmin, requireStaff, staffGroups } from "../auth/session";
import { UUID, normaliseEmail } from "../auth/tokens";
import { appUrl } from "../config";
import { londonTime } from "../dates";
import { asSystem, asUser } from "../db";
import { AGE_GROUPS, isAgeGroup, type AgeGroup, type SessionKind } from "../domain";
import { canSendEmail } from "../email/send";
import { cleanBody, cleanPhone, cleanText, dialable } from "../validate";
import { applyImport, planImport, type ImportProblem, type ImportSummary } from "./import";
import { overlaps, within } from "./scope";
import { familiesFilterFromForm, familiesHref, familiesInviteHref, familyChildHref, withQuery } from "./families-link";
import { addSessionRun, addedSentence, cancelSession, editSession, postSessionNotice, removeSession, type SessionEdit } from "./sessions";
import { BULK_MAX, bulkCancel, bulkDelete, bulkEdit, bulkResultQuery, isBulkAction, parseIds, patchIsEmpty, type BulkEditPatch } from "./bulk-sessions";
import { changeStaffRole, removeStaffMember } from "./staff";
import { newsReaches } from "../squads/sql";
import { canManageSquad, saveSquad } from "../squads/squads";
import { enqueue } from "../background";
import { runChase } from "../chase/run";
import { sendInvites } from "./invites";
import { deleteLeftoverAccounts, removeChildRecord, unlinkGuardianRecord } from "./remove";
import { closeDeletionRequest } from "../data-requests";
import { TOPICS } from "./topics";

// Club admin Server Actions. Each checks the role first, then writes as that person,
// so row level security still applies (staff manage the club; only admins manage staff).

const id = (v: FormDataEntryValue | null) => (typeof v === "string" && UUID.test(v) ? v : null);

async function inviteBase(): Promise<string | null> {
  const configured = appUrl();
  if (configured || process.env.NODE_ENV === "production") return configured;
  const host = (await headers()).get("host");
  return host ? `http://${host}` : null;
}

// Families import -------------------------------------------------------------

export type ImportState = {
  stage: "start" | "preview" | "done";
  csv?: string;
  error?: string;
  errors?: ImportProblem[];
  warnings?: ImportProblem[];
  /** To look at before importing: groups that don't match a date of birth, possible duplicates, repeated rows. */
  checks?: ImportProblem[];
  summary?: ImportSummary;
  sample?: { line: number; child: string; group: AgeGroup; parents: string }[];
  count?: number;
};

class DryRun extends Error {
  constructor(readonly summary: ImportSummary) {
    super("dry run");
  }
}

const MAX_CSV_BYTES = 1_000_000;

export async function importFamilies(prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireAdmin();
  const intent = formData.get("intent");

  let csv = typeof formData.get("csv") === "string" ? (formData.get("csv") as string) : "";
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) return { stage: "start", error: "That file is too big. Split it into smaller files of under 1 MB." };
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      return { stage: "start", error: "Upload a .csv file. In Excel or Google Sheets, use File > Save as (or Download) > CSV." };
    }
    csv = await file.text();
  }
  if (!csv.trim()) return { stage: "start", error: "Choose a CSV file or paste the rows." };
  if (csv.length > MAX_CSV_BYTES) return { stage: "start", error: "That's too much to import at once. Split it into smaller files." };

  const plan = planImport(csv);
  if (intent === "apply") {
    // Rows with problems were shown in the preview and are skipped; the rest go in.
    if (plan.rows.length === 0) return { ...prev, stage: "preview", errors: plan.errors };
    const summary = await asUser(user.id, (tx) => applyImport(tx, plan));
    return { stage: "done", summary };
  }

  if (plan.rows.length === 0) return { stage: "start", errors: plan.errors, warnings: plan.warnings, checks: plan.checks, error: "Nothing to import yet." };
  // Work out what would change, then roll it back.
  let summary: ImportSummary;
  try {
    await asUser(user.id, async (tx) => {
      throw new DryRun(await applyImport(tx, plan));
    });
    throw new Error("unreachable");
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    summary = e.summary;
  }
  return {
    stage: "preview",
    csv,
    errors: plan.errors,
    warnings: plan.warnings,
    checks: [...plan.checks, ...summary.possibleDuplicates].sort((a, b) => a.line - b.line),
    summary,
    count: plan.rows.length,
    sample: plan.rows.slice(0, 8).map((r) => ({
      line: r.line,
      child: `${r.child.firstName} ${r.child.lastName}`,
      group: r.child.ageGroup,
      parents: r.parents.map((p) => `${p.firstName} ${p.lastName} (${p.email})`).join(", "),
    })),
  };
}

// Invites ---------------------------------------------------------------------

/**
 * Emails invites to the parents not yet invited who have a child in the Families list as filtered (group, need, q;
 * none = the whole club). Only from the confirmation page (/admin/families/invite), which sends confirm=yes;
 * anything else goes to that page. Returns to the same list with the result.
 */
export async function inviteParents(formData: FormData): Promise<void> {
  await requireAdmin();
  const filter = familiesFilterFromForm(formData, AGE_GROUPS);
  const back = (query: string) => redirect(withQuery(familiesHref(filter), query));
  if (formData.get("confirm") !== "yes") redirect(familiesInviteHref(filter));
  if (!canSendEmail()) back("invite=no-email");
  const base = await inviteBase();
  if (!base) back("invite=no-url");
  const { sent, failed } = await sendInvites({ filter: { group: filter.group, need: filter.need, search: filter.q || null }, baseUrl: base });
  back(`invited=${sent}${failed ? `&notSent=${failed}` : ""}`);
}

export async function resendInvite(formData: FormData): Promise<void> {
  await requireAdmin();
  const guardian = id(formData.get("guardian"));
  const child = id(formData.get("child"));
  if (!guardian || !child) return;
  // Back to the child with the Families filters it was opened with, so "← Families" still returns to that list.
  const page = familyChildHref(child, familiesFilterFromForm(formData, AGE_GROUPS));
  if (!canSendEmail()) redirect(withQuery(page, "invite=no-email"));
  const base = await inviteBase();
  if (!base) redirect(withQuery(page, "invite=no-url"));
  const { failed } = await sendInvites({ guardianIds: [guardian], baseUrl: base });
  redirect(withQuery(page, failed ? "invite=failed" : "invited=1"));
}

// Children and parents --------------------------------------------------------

/** `message` replaces the form's usual "saved" line when the result needs saying (e.g. dates skipped). */
export type FormState = { error?: string; saved?: boolean; message?: string };

export async function updateChild(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const child = id(formData.get("id"));
  const firstName = cleanText(formData.get("firstName"), 60);
  const lastName = cleanText(formData.get("lastName"), 60);
  const group = formData.get("ageGroup");
  const shirtText = cleanText(formData.get("shirtNumber"), 3);
  const shirt = shirtText ? Number(shirtText) : null;
  const dob = cleanText(formData.get("dateOfBirth"), 10);
  if (!child) return { error: "Something went wrong. Reload and try again." };
  if (!firstName || !lastName) return { error: "Add the child's first and last name." };
  if (!isAgeGroup(group)) return { error: "Choose a group." };
  if (shirt !== null && !(Number.isInteger(shirt) && shirt >= 1 && shirt <= 99)) return { error: "Shirt numbers go from 1 to 99." };
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return { error: "Choose a date of birth." };
  await asUser(user.id, (tx) =>
    tx.query(
      `update players set first_name = $2, last_name = $3, age_group = $4::age_group, shirt_number = $5, position = $6, date_of_birth = $7::date where id = $1`,
      [child, firstName, lastName, group, shirt, cleanText(formData.get("position"), 40), dob || null],
    ),
  );
  refresh();
  return { saved: true };
}

export async function setPayment(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const child = id(formData.get("child"));
  const state = formData.get("state");
  if (!child || !["active", "missing", "overdue", "self_reported"].includes(String(state))) return;
  const mine = coachLimit(user.staff);
  await asUser(user.id, async (tx) => {
    if (mine) {
      // A coach with their own groups sets payment only for children in those groups.
      const [p] = await tx.query<{ age_group: string }>(`select age_group::text as age_group from players where id = $1`, [child]);
      if (!p || !within([p.age_group], mine)) return;
    }
    await tx.query(
      `insert into payment_status (player_id, state, updated_at) values ($1, $2::payment_state, now())
       on conflict (player_id) do update set state = excluded.state, updated_at = now()`,
      [child, state],
    );
  });
  refresh();
}

export async function saveGuardian(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const child = id(formData.get("child"));
  const guardian = id(formData.get("guardian"));
  const firstName = cleanText(formData.get("firstName"), 60);
  const lastName = cleanText(formData.get("lastName"), 60) ?? "";
  const email = normaliseEmail(formData.get("email"));
  const phoneText = cleanText(formData.get("phone"), 30);
  const phone = cleanPhone(phoneText);
  if (!child) return { error: "Something went wrong. Reload and try again." };
  if (!firstName) return { error: "Add the parent's first name." };
  if (!email) return { error: "Add an email address. It's how they sign in." };
  if (phoneText && !phone) return { error: "That phone number doesn't look right. Use a UK mobile like 07700 900123." };

  const result = await asUser(user.id, async (tx) => {
    const [clash] = await tx.query<{ id: string }>(`select id from guardians where lower(email) = $1 and id is distinct from $2::uuid`, [email, guardian]);
    if (guardian) {
      if (clash) return "This email belongs to another parent at the club.";
      // A new email means a new sign-in: unlink the old one so only the new address works.
      await tx.query(
        `update guardians set first_name = $2, last_name = $3, phone = $5,
           auth_user_id = case when lower(email) = $4 then auth_user_id end,
           invited_at = case when lower(email) = $4 then invited_at end,
           email = $4
         where id = $1`,
        [guardian, firstName, lastName, email, phone],
      );
      return null;
    }
    const [g] = clash
      ? [clash]
      : await tx.query<{ id: string }>(`insert into guardians (first_name, last_name, email, phone) values ($1, $2, $3, $4) returning id`, [
          firstName,
          lastName,
          email,
          phone,
        ]);
    await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2) on conflict do nothing`, [child, g.id]);
    return null;
  });
  if (result) return { error: result };
  refresh();
  return { saved: true };
}

export async function unlinkGuardian(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const child = id(formData.get("child"));
  const guardian = id(formData.get("guardian"));
  if (!child || !guardian) return;
  const removed = await asUser(user.id, (tx) => unlinkGuardianRecord(tx, child, guardian));
  await asSystem((tx) => deleteLeftoverAccounts(tx, removed));
  refresh();
}

export async function removeChild(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const child = id(formData.get("child"));
  if (!child || formData.get("confirm") !== "yes") return;
  // Parents with no other children at the club go too, with their sign-ins.
  const removed = await asUser(user.id, (tx) => removeChildRecord(tx, child));
  await asSystem((tx) => deleteLeftoverAccounts(tx, removed));
  redirect(withQuery(familiesHref(familiesFilterFromForm(formData, AGE_GROUPS)), "removed=1"));
}

/** "Done" on a parent's request to be deleted (the overview): the admin has dealt with it another way. */
export async function closeDataRequest(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const request = id(formData.get("request"));
  if (!request) return;
  await asUser(user.id, (tx) => closeDeletionRequest(tx, request));
  refresh();
}

// News ------------------------------------------------------------------------

/**
 * Posts a message. With `squadSession` (from a session's Squad page) it goes only to the parents of the children
 * picked for that session's squad; its audience is the session's groups, so group coaches' views treat it as theirs.
 */
export async function postNews(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStaff();
  const topic = formData.get("topic");
  const title = cleanText(formData.get("title"), 120);
  const body = cleanBody(formData.get("body"), 4000);
  const squadSession = formData.has("squadSession") ? id(formData.get("squadSession")) : undefined;
  if (squadSession === null) return { error: "Something went wrong. Reload and try again." };
  let everyone = formData.get("audience") === "all";
  let groups = formData.getAll("groups").filter(isAgeGroup);
  if (!TOPICS.includes(topic as (typeof TOPICS)[number])) return { error: "Choose a topic." };
  if (!title) return { error: "Add a headline." };
  if (!body) return { error: "Write the message." };
  if (squadSession) {
    const [s] = await asUser(user.id, (tx) =>
      tx.query<{ age_groups: string[]; picked: number }>(
        `select age_groups::text[] as age_groups, (select count(*)::int from session_squads q where q.session_id = s.id) as picked
         from sessions s where s.id = $1`,
        [squadSession],
      ),
    );
    if (!s || !canManageSquad(s.age_groups, coachLimit(user.staff))) return { error: "Only an admin can message this squad." };
    if (s.picked === 0) return { error: "Pick the squad first, then message them." };
    everyone = false;
    groups = s.age_groups.filter(isAgeGroup);
  }
  if (!everyone && groups.length === 0) return { error: "Choose who it's for: everyone, or at least one group." };
  if (isGroupCoach(user.staff)) {
    const mine = staffGroups(user.staff);
    if (everyone || groups.some((g) => !mine.includes(g))) return { error: `You can post to your own groups: ${mine.join(", ")}.` };
  }
  const [row] = await asUser(user.id, (tx) =>
    tx.query<{ id: string }>(
      `insert into announcements (topic, title, body, audience, requires_ack, posted_by, squad_session_id)
       values ($1, $2, $3, $4::text[]::age_group[], $5, $6, $7) returning id`,
      [topic, title, body, everyone ? null : groups, formData.get("requiresAck") === "on", user.staff.id, squadSession ?? null],
    ),
  );
  // First rung of the chase ladder: notify parents once the response has gone (unless it's night-time; the hourly
  // run picks it up at 8am), so a slow push or email service never holds up or fails the post. Queued behind any
  // earlier post's run, so several posts in a row don't chase at once.
  if (formData.get("requiresAck") === "on") {
    after(() => enqueue("chase on post", () => runChase({ announcementId: row.id })));
  }
  redirect(`/admin/news/${row.id}?posted=1`);
}

export async function deleteNews(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const news = id(formData.get("id"));
  if (!news || formData.get("confirm") !== "yes") return;
  const mine = coachLimit(user.staff);
  const deleted = await asUser(user.id, async (tx) => {
    if (mine) {
      // A coach with their own groups deletes only messages for those groups alone, never "every family".
      const [a] = await tx.query<{ audience: string[] | null }>(`select audience::text[] as audience from announcements where id = $1`, [news]);
      if (!a || !within(a.audience, mine)) return false;
    }
    await tx.query(`delete from announcements where id = $1`, [news]);
    return true;
  });
  if (!deleted) return;
  redirect("/admin/news");
}

/** Logs the chase, then opens WhatsApp with a short message ready to send. */
export async function chaseOnWhatsApp(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const news = id(formData.get("news"));
  const guardian = id(formData.get("guardian"));
  if (!news || !guardian) return;
  const mine = coachLimit(user.staff);
  const found = await asUser(user.id, async (tx) => {
    const [row] = await tx.query<{ first_name: string; phone: string | null; title: string; audience: string[] | null; in_my_groups: boolean; reached: boolean }>(
      `select g.first_name, g.phone, a.title, a.audience::text[] as audience,
         exists (select 1 from player_guardians pg join players p on p.id = pg.player_id
                 where pg.guardian_id = g.id and ($3::text[] is null or p.age_group::text = any ($3::text[]))) as in_my_groups,
         exists (select 1 from player_guardians pg join players p on p.id = pg.player_id where pg.guardian_id = g.id and ${newsReaches("a", "p")}) as reached
       from guardians g, announcements a where g.id = $1 and a.id = $2`,
      [guardian, news, mine],
    );
    // Only parents the message is for (for a squad message, the squad's parents).
    if (!row?.phone || !row.reached) return null;
    // A coach with their own groups chases only their groups' parents about messages that reached them.
    if (mine && !(overlaps(row.audience, mine) && row.in_my_groups)) return null;
    await tx.query(`insert into announcement_chases (announcement_id, guardian_id, channel) values ($1, $2, 'whatsapp')`, [news, guardian]);
    return row;
  });
  if (!found?.phone) redirect(`/admin/news/${news}`);
  const base = (await inviteBase()) ?? "";
  const text = `Assalamu alaikum ${found.first_name}, please could you open the Deen Squad app and read "${found.title}"? ${base}/news`;
  redirect(`https://wa.me/${dialable(found.phone)}?text=${encodeURIComponent(text)}`);
}

// Sessions --------------------------------------------------------------------

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KINDS: readonly SessionKind[] = ["training", "match", "tournament"];

/** The fields shared by the Add and Edit forms, checked. `date` is the first (or only) date. */
function sessionFields(formData: FormData, mine: readonly AgeGroup[] | null) {
  const kind = formData.get("kind");
  const title = cleanText(formData.get("title"), 60);
  const venue = cleanText(formData.get("venue"), 120);
  const groups = formData.getAll("groups").filter(isAgeGroup);
  const date = DATE.exec(String(formData.get("date") ?? ""));
  const start = TIME.exec(String(formData.get("start") ?? ""));
  const end = TIME.exec(String(formData.get("end") ?? ""));
  if (!KINDS.includes(kind as SessionKind)) return { error: "Choose the kind of session." } as const;
  if (!title) return { error: "Add a title, like Training." } as const;
  if (!venue) return { error: "Add the venue." } as const;
  if (groups.length === 0) return { error: "Choose at least one group." } as const;
  if (mine && groups.some((g) => !mine.includes(g))) return { error: `You can manage your own groups only: ${mine.join(", ")}.` } as const;
  if (!date) return { error: "Choose the date." } as const;
  if (!start || !end) return { error: "Add start and finish times." } as const;
  if (end[0] <= start[0]) return { error: "The finish time must be after the start time." } as const;
  const day = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]));
  const at = (t: number, time: RegExpExecArray) => {
    const d = new Date(t);
    return londonTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), Number(time[1]), Number(time[2]));
  };
  return {
    fields: {
      kind: kind as SessionKind,
      title,
      venue,
      groups,
      arriveBy: cleanText(formData.get("arriveBy"), 20),
      kit: cleanText(formData.get("kit"), 120),
      prayerNote: cleanText(formData.get("prayerNote"), 120),
      notes: cleanBody(formData.get("notes"), 500),
    },
    day,
    /** Start and end on the calendar day `t` (UTC midnight). */
    times: (t: number) => ({ start: at(t, start), end: at(t, end) }),
  } as const;
}

export async function addSessions(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStaff();
  const checked = sessionFields(formData, coachLimit(user.staff));
  if ("error" in checked) return { error: checked.error };
  const untilText = String(formData.get("until") ?? "");
  const until = untilText ? DATE.exec(untilText) : null;
  if (untilText && !until) return { error: "Choose a valid end date for the repeats." };
  const last = until ? Date.UTC(Number(until[1]), Number(until[2]) - 1, Number(until[3])) : checked.day;
  if (last < checked.day) return { error: "The repeat end date is before the first date." };
  const days: number[] = [];
  for (let t = checked.day; t <= last; t += 7 * 86400000) days.push(t);
  if (days.length > 52) return { error: "That's more than a year of weekly sessions. Add one term at a time." };

  // Dates that already have this session (same start, a shared group) are skipped, so a term added twice isn't doubled.
  const result = await asUser(user.id, (tx) => addSessionRun(tx, { ...checked.fields, times: days.map(checked.times) }));
  refresh();
  return { saved: true, message: addedSentence(result) };
}

/** Saves a session's details from its Edit page; optionally tells the families it reaches. */
export async function updateSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStaff();
  const session = id(formData.get("id"));
  if (!session) return { error: "Something went wrong. Reload and try again." };
  const checked = sessionFields(formData, coachLimit(user.staff));
  if ("error" in checked) return { error: checked.error };
  const edit: SessionEdit = { ...checked.fields, ...checked.times(checked.day) };
  const tell = formData.get("notify") === "on";
  const result = await asUser(user.id, async (tx) => {
    const saved = await editSession(tx, session, edit, coachLimit(user.staff));
    const news = saved.ok && tell ? await postSessionNotice(tx, session, "changed", user.staff.id) : null;
    return { saved, news };
  });
  if (!result.saved.ok) {
    return { error: result.saved.reason === "not_yours" ? "Only an admin can change this session." : "That session has gone. Reload and try again." };
  }
  if (result.news) chaseNow(result.news);
  refresh();
  const removed = result.saved.squadRemoved;
  const parts = [
    "Saved.",
    removed ? `${removed} ${removed === 1 ? "child" : "children"} no longer in its groups came out of the squad.` : null,
    result.saved.squadEmptied ? "Nobody is left in the squad, so the session is open to all its groups' families again. Pick a squad if it's only for some." : null,
    result.news ? "The families have been told." : null,
  ];
  return { saved: true, message: parts.filter(Boolean).join(" ") };
}

/** Pushes (and, as it's urgent, emails) a session notice once the response has gone (see postNews). */
function chaseNow(announcementId: string) {
  after(() => enqueue("chase on post", () => runChase({ announcementId })));
}

/**
 * Cancels (with an optional reason) or restores a session, from its Cancel page. With "Tell the families now"
 * ticked it also posts urgent club news to the families it reaches.
 */
export async function setSessionCancelled(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const session = id(formData.get("id"));
  if (!session) return;
  const cancel = formData.get("cancel") === "yes";
  const reason = cancel ? cleanText(formData.get("reason"), 120) : null;
  const tell = formData.get("notify") === "on";
  // A coach with their own groups changes only sessions for those groups alone (no-op otherwise).
  const news = await asUser(user.id, async (tx) => {
    const changed = await cancelSession(tx, session, cancel, coachLimit(user.staff), reason);
    return changed && tell ? postSessionNotice(tx, session, cancel ? "cancelled" : "restored", user.staff.id) : null;
  });
  if (news) chaseNow(news);
  redirect(`/admin/sessions?${cancel ? "cancelled" : "restored"}=1${news ? "&told=1" : ""}`);
}

/** Deletes a session from its Delete page, which says what goes with it and sends confirm=yes. */
export async function deleteSession(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const session = id(formData.get("id"));
  if (!session || formData.get("confirm") !== "yes") return;
  // Only sessions nobody has been checked in to, and for a group coach only their own groups' sessions.
  const gone = await asUser(user.id, (tx) => removeSession(tx, session, coachLimit(user.staff)));
  redirect(gone ? "/admin/sessions?deleted=1" : "/admin/sessions");
}

// Bulk changes (the ticked sessions on Admin → Sessions) ---------------------------

/**
 * The bulk bar's buttons: takes the ticked ids to the confirm page for the chosen action, as `?ids=a,b,c`
 * (a plain form, so it works without JavaScript). None ticked, or more than the cap, goes back with a notice.
 */
export async function openBulk(formData: FormData): Promise<void> {
  await requireStaff();
  const action = formData.get("do");
  const ids = parseIds(formData.getAll("ids"));
  if (!isBulkAction(action)) redirect("/admin/sessions");
  if (ids.length === 0) redirect("/admin/sessions?bulk=none");
  if (ids.length > BULK_MAX) redirect("/admin/sessions?bulk=toomany");
  redirect(`/admin/sessions/bulk/${action}?ids=${ids.join(",")}`);
}

/** The ids posted back by a bulk confirm page's hidden fields. */
function bulkIds(formData: FormData): string[] {
  return parseIds(formData.getAll("ids")).slice(0, BULK_MAX);
}

/** Bulk edit: only the fields filled in change, on every session picked. Returns an error to the form, else redirects with the notice. */
export async function bulkEditSessions(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStaff();
  const mine = coachLimit(user.staff);
  const ids = bulkIds(formData);
  if (ids.length === 0) return { error: "No sessions are picked. Go back to Sessions and tick some." };
  const text = (name: string, max: number) => cleanText(formData.get(name), max) ?? undefined;
  const time = (name: string) => {
    const m = TIME.exec(String(formData.get(name) ?? ""));
    return m ? { hour: Number(m[1]), minute: Number(m[2]) } : undefined;
  };
  const kindValue = formData.get("kind");
  const kind = typeof kindValue === "string" && kindValue ? (kindValue as SessionKind) : undefined;
  if (kind && !KINDS.includes(kind)) return { error: "Choose the kind of session." };
  const startText = String(formData.get("start") ?? "");
  const endText = String(formData.get("end") ?? "");
  if ((startText && !time("start")) || (endText && !time("end"))) return { error: "Check the start and finish times." };
  const start = time("start");
  const end = time("end");
  if (start && end && end.hour * 60 + end.minute <= start.hour * 60 + start.minute) return { error: "The finish time must be after the start time." };
  let groups: AgeGroup[] | undefined;
  if (formData.get("changeGroups") === "on") {
    groups = formData.getAll("groups").filter(isAgeGroup);
    if (groups.length === 0) return { error: "Choose at least one group, or untick Change groups." };
    if (mine && groups.some((g) => !mine.includes(g))) return { error: `You can manage your own groups only: ${mine.join(", ")}.` };
  }
  const patch: BulkEditPatch = {
    kind,
    title: text("title", 60),
    venue: text("venue", 120),
    start,
    end,
    arriveBy: text("arriveBy", 20),
    kit: text("kit", 120),
    prayerNote: text("prayerNote", 120),
    notes: cleanBody(formData.get("notes"), 500) ?? undefined,
    groups,
  };
  if (patchIsEmpty(patch)) return { error: "Fill in at least one field to change. Blank fields are left as they are." };
  const tell = formData.get("notify") === "on";
  const result = await asUser(user.id, (tx) => bulkEdit(tx, ids, patch, mine, tell, user.staff.id));
  for (const news of result.news) chaseNow(news);
  redirect(`/admin/sessions?${bulkResultQuery("edit", result)}`);
}

/** Bulk cancel or restore, from its confirm page: one reason for all, "Tell the families now" per session. */
export async function bulkCancelSessions(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const ids = bulkIds(formData);
  const cancel = formData.get("cancel") === "yes";
  if (ids.length === 0) redirect("/admin/sessions?bulk=none");
  const reason = cancel ? cleanText(formData.get("reason"), 120) : null;
  const tell = formData.get("notify") === "on";
  const result = await asUser(user.id, (tx) => bulkCancel(tx, ids, cancel, coachLimit(user.staff), reason, tell, user.staff.id));
  for (const news of result.news) chaseNow(news);
  redirect(`/admin/sessions?${bulkResultQuery(cancel ? "cancel" : "restore", result)}`);
}

/** Bulk delete, from its confirm page (which sends confirm=yes and leaves out sessions with check-ins; refused again here). */
export async function bulkDeleteSessions(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const ids = bulkIds(formData);
  if (ids.length === 0 || formData.get("confirm") !== "yes") redirect("/admin/sessions?bulk=none");
  const result = await asUser(user.id, (tx) => bulkDelete(tx, ids, coachLimit(user.staff)));
  redirect(`/admin/sessions?${bulkResultQuery("delete", result)}`);
}

/** Saves the tournament squad picked on a session's Squad page (admins any session; a group coach only their own groups'). */
export async function saveSquadPicks(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStaff();
  const session = id(formData.get("session"));
  if (!session) return { error: "Something went wrong. Reload and try again." };
  const players = formData.getAll("player").filter((v): v is string => typeof v === "string" && UUID.test(v));
  const result = await asUser(user.id, (tx) => saveSquad(tx, session, players, user.staff.id, coachLimit(user.staff)));
  if (!result.ok) return { error: result.reason === "not_yours" ? "Only an admin can pick the squad for this session." : "That session has gone. Reload and try again." };
  refresh();
  return { saved: true };
}

// Staff -----------------------------------------------------------------------

export async function addStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const name = cleanText(formData.get("name"), 60);
  const email = normaliseEmail(formData.get("email"));
  const role = formData.get("role");
  if (!name) return { error: "Add their name as parents should see it, like Coach Bilal." };
  if (!email) return { error: "Add their email address. It's how they sign in." };
  if (role !== "coach" && role !== "admin") return { error: "Choose coach or admin." };
  const groups = role === "coach" ? formData.getAll("groups").filter(isAgeGroup) : [];
  const added = await asUser(user.id, (tx) =>
    tx.query(
      `insert into staff (email, display_name, role, age_groups) values ($1, $2, $3::staff_role, $4::text[]::age_group[])
       on conflict ((lower(email))) do nothing returning id`,
      [email, name, role, groups],
    ),
  );
  if (added.length === 0) return { error: "That email is already on the staff list." };
  refresh();
  return { saved: true };
}

/** Which age groups a coach looks after. None ticked means every group. */
export async function setStaffGroups(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const staff = id(formData.get("id"));
  if (!staff) return;
  const groups = formData.getAll("groups").filter(isAgeGroup);
  await asUser(user.id, (tx) => tx.query(`update staff set age_groups = $2::text[]::age_group[] where id = $1 and role = 'coach'`, [staff, groups]));
  refresh();
}

/**
 * Makes a coach an admin or an admin a coach (Admin → Staff). Never the last admin, and not your own role
 * (the Staff screen doesn't offer it, as with Remove). Ticked age groups are cleared either way.
 */
export async function setStaffRole(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const staff = id(formData.get("id"));
  const role = formData.get("role");
  if (!staff || staff === user.staff.id || (role !== "admin" && role !== "coach")) return;
  await asUser(user.id, (tx) => changeStaffRole(tx, staff, role));
  refresh();
}

export async function removeStaff(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const staff = id(formData.get("id"));
  if (!staff || staff === user.staff.id) return;
  await asUser(user.id, (tx) => removeStaffMember(tx, staff));
  refresh();
}
