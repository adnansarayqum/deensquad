"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { coachLimit, isGroupCoach, requireAdmin, requireStaff, staffGroups } from "../auth/session";
import { UUID, normaliseEmail } from "../auth/tokens";
import { appUrl } from "../config";
import { londonTime } from "../dates";
import { asUser } from "../db";
import { AGE_GROUPS, isAgeGroup, type AgeGroup } from "../domain";
import { canSendEmail } from "../email/send";
import { cleanBody, cleanPhone, cleanText, dialable } from "../validate";
import { applyImport, planImport, type ImportProblem, type ImportSummary } from "./import";
import { overlaps, within } from "./scope";
import { cancelSession, removeSession } from "./sessions";
import { newsReaches } from "../squads/sql";
import { canManageSquad, saveSquad } from "../squads/squads";
import { runChase } from "../chase/run";
import { sendInvites } from "./invites";
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

  if (plan.rows.length === 0) return { stage: "start", errors: plan.errors, warnings: plan.warnings, error: "Nothing to import yet." };
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

export async function inviteParents(): Promise<void> {
  await requireAdmin();
  if (!canSendEmail()) redirect("/admin/families?invite=no-email");
  const base = await inviteBase();
  if (!base) redirect("/admin/families?invite=no-url");
  const { sent, failed } = await sendInvites({ baseUrl: base });
  redirect(`/admin/families?invited=${sent}${failed ? `&notSent=${failed}` : ""}`);
}

export async function resendInvite(formData: FormData): Promise<void> {
  await requireAdmin();
  const guardian = id(formData.get("guardian"));
  const child = id(formData.get("child"));
  if (!guardian || !child) return;
  if (!canSendEmail()) redirect(`/admin/families/${child}?invite=no-email`);
  const base = await inviteBase();
  if (!base) redirect(`/admin/families/${child}?invite=no-url`);
  const { failed } = await sendInvites({ guardianIds: [guardian], baseUrl: base });
  redirect(`/admin/families/${child}?${failed ? "invite=failed" : "invited=1"}`);
}

// Children and parents --------------------------------------------------------

export type FormState = { error?: string; saved?: boolean };

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
  if (!isAgeGroup(group)) return { error: "Choose an age group." };
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
  await asUser(user.id, async (tx) => {
    await tx.query(`delete from player_guardians where player_id = $1 and guardian_id = $2`, [child, guardian]);
    await tx.query(`delete from guardians g where g.id = $1 and not exists (select 1 from player_guardians where guardian_id = g.id)`, [guardian]);
  });
  refresh();
}

export async function removeChild(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const child = id(formData.get("child"));
  if (!child || formData.get("confirm") !== "yes") return;
  await asUser(user.id, async (tx) => {
    const guardians = await tx.query<{ guardian_id: string }>(`select guardian_id from player_guardians where player_id = $1`, [child]);
    await tx.query(`delete from players where id = $1`, [child]);
    // Parents with no other children at the club go too.
    await tx.query(`delete from guardians g where g.id = any($1::uuid[]) and not exists (select 1 from player_guardians where guardian_id = g.id)`, [
      guardians.map((g) => g.guardian_id),
    ]);
  });
  redirect("/admin/families?removed=1");
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
  if (!everyone && groups.length === 0) return { error: "Choose who it's for: everyone, or at least one age group." };
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
  // First rung of the chase ladder: notify parents now (unless it's night-time; the hourly run picks it up at 8am).
  if (formData.get("requiresAck") === "on") {
    await runChase({ announcementId: row.id }).catch((e) => console.error("[chase] on post:", e instanceof Error ? e.message : e));
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

export async function addSessions(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireStaff();
  const kind = formData.get("kind");
  const title = cleanText(formData.get("title"), 60);
  const venue = cleanText(formData.get("venue"), 120);
  const groups = formData.getAll("groups").filter(isAgeGroup);
  const first = DATE.exec(String(formData.get("date") ?? ""));
  const untilText = String(formData.get("until") ?? "");
  const until = untilText ? DATE.exec(untilText) : null;
  const start = TIME.exec(String(formData.get("start") ?? ""));
  const end = TIME.exec(String(formData.get("end") ?? ""));
  if (!["training", "match", "tournament"].includes(String(kind))) return { error: "Choose the kind of session." };
  if (!title) return { error: "Add a title, like Training." };
  if (!venue) return { error: "Add the venue." };
  if (groups.length === 0) return { error: "Choose at least one age group." };
  const mine = coachLimit(user.staff);
  if (mine && groups.some((g) => !mine.includes(g))) return { error: `You can manage your own groups only: ${mine.join(", ")}.` };
  if (!first) return { error: "Choose the date." };
  if (untilText && !until) return { error: "Choose a valid end date for the repeats." };
  if (!start || !end) return { error: "Add start and finish times." };
  if (end[0] <= start[0]) return { error: "The finish time must be after the start time." };

  const day0 = Date.UTC(Number(first[1]), Number(first[2]) - 1, Number(first[3]));
  const last = until ? Date.UTC(Number(until[1]), Number(until[2]) - 1, Number(until[3])) : day0;
  if (last < day0) return { error: "The repeat end date is before the first date." };
  const dates: Date[] = [];
  for (let t = day0; t <= last; t += 7 * 86400000) dates.push(new Date(t));
  if (dates.length > 52) return { error: "That's more than a year of weekly sessions. Add one term at a time." };

  await asUser(user.id, async (tx) => {
    for (const d of dates) {
      const [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      await tx.query(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups, arrive_by, kit, prayer_note)
         values ($1::session_kind, $2, $3, $4, $5, $6::text[]::age_group[], $7, $8, $9)`,
        [
          kind,
          title,
          londonTime(y, m, dd, Number(start[1]), Number(start[2])),
          londonTime(y, m, dd, Number(end[1]), Number(end[2])),
          venue,
          AGE_GROUPS.filter((g) => groups.includes(g)),
          cleanText(formData.get("arriveBy"), 20),
          cleanText(formData.get("kit"), 120),
          cleanText(formData.get("prayerNote"), 120),
        ],
      );
    }
  });
  refresh();
  return { saved: true, error: undefined };
}

export async function setSessionCancelled(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const session = id(formData.get("id"));
  if (!session) return;
  const cancel = formData.get("cancel") === "yes";
  // A coach with their own groups changes only sessions for those groups alone (no-op otherwise).
  await asUser(user.id, (tx) => cancelSession(tx, session, cancel, coachLimit(user.staff)));
  refresh();
}

export async function deleteSession(formData: FormData): Promise<void> {
  const user = await requireStaff();
  const session = id(formData.get("id"));
  if (!session) return;
  // Only sessions nobody has been checked in to, and for a group coach only their own groups' sessions.
  await asUser(user.id, (tx) => removeSession(tx, session, coachLimit(user.staff)));
  refresh();
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

export async function removeStaff(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const staff = id(formData.get("id"));
  if (!staff || staff === user.staff.id) return;
  await asUser(user.id, (tx) =>
    tx.query(
      `delete from staff s where s.id = $1 and (s.role <> 'admin' or (select count(*) from staff where role = 'admin') > 1)`,
      [staff],
    ),
  );
  refresh();
}
