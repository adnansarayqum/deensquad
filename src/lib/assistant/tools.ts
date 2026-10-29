import { CONTRACT } from "../documents/contract";
import { clock, londonDate, londonTime, shortDay } from "../dates";
import type { Queryable } from "../db/types";
import { AGE_GROUPS, isAgeGroup, type AgeGroup, type PaymentState, type SessionKind } from "../domain";
import { loadWhoIsComing } from "../admin/coming";
import { loadDashboard } from "../admin/dashboard";
import { likePattern, loadChild, loadFamilies, loadNewsDetail, loadNewsList } from "../admin/data";
import { NEEDS, isNeed, type Need } from "../admin/needs";
import { TOPICS } from "../admin/topics";

// What the admins' assistant can do, as tools Claude calls. Every tool runs inside the admin's own `asUser`
// transaction, so row level security applies as on any admin page, and returns only what the app has. Nothing here
// changes club data: the propose_* tools check the input and keep a draft (assistant_actions), which happens only
// when the admin taps Confirm (confirm.ts). Medical needs, wellbeing check-ins and sports hub codes are never read.

export type ToolContext = { now: Date; staffId: string };
export type Draft = { id: string; kind: DraftKind; summary: string; lines: string[] };
export type DraftKind = "add_sessions" | "cancel_session" | "post_news";
export type ToolResult = { content: unknown; draft?: Draft };

type Schema = { type: "object"; properties: Record<string, unknown>; required?: string[] };
export type ToolDef = { name: string; description: string; input_schema: Schema };

const str = (description: string) => ({ type: "string", description });
const GROUP_ENUM = { type: "string", enum: [...AGE_GROUPS] };
const NEED_KEYS = Object.keys(NEEDS) as Need[];

export const TOOLS: ToolDef[] = [
  {
    name: "find_people",
    description: "Find children by the child's or a parent's name (part of a name works). Returns each child's id, group and parents.",
    input_schema: { type: "object", properties: { name: str("Part of a child's or parent's name, e.g. 'Yusuf' or 'Sara Khan'.") }, required: ["name"] },
  },
  {
    name: "child_details",
    description:
      "Everything the club's admin page shows about one child: group, parents with contact details and whether they use the app, payment plan, to-do steps still missing (contract, emergency contact, photo answer), attendance this season. Use the id from find_people.",
    input_schema: { type: "object", properties: { child_id: str("The child's id from find_people.") }, required: ["child_id"] },
  },
  {
    name: "children_needing",
    description: `Children with something outstanding, as on the Families list. needs: ${NEED_KEYS.map((n) => `${n} (${NEEDS[n].label})`).join("; ")}.`,
    input_schema: {
      type: "object",
      properties: { need: { type: "string", enum: NEED_KEYS }, group: { ...GROUP_ENUM, description: "Only this group (optional)." } },
      required: ["need"],
    },
  },
  {
    name: "club_overview",
    description: "The club's headline numbers: children, parents on the app, payment plans, to-do steps outstanding, season attendance by group, the next session's answers, news read, staff checks, shop.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_sessions",
    description: "Sessions between two dates (London), with their id, groups, times, venue, whether cancelled, and answers or check-ins.",
    input_schema: {
      type: "object",
      properties: {
        from: str("First day, YYYY-MM-DD. Default today."),
        to: str("Last day, YYYY-MM-DD. Default 14 days after from."),
        group: { ...GROUP_ENUM, description: "Only sessions for this group (optional)." },
      },
    },
  },
  {
    name: "who_is_coming",
    description: "For the next session day: every child who said coming, not coming (with the family's reason) or hasn't answered.",
    input_schema: { type: "object", properties: { group: { ...GROUP_ENUM, description: "Only this group (optional)." } } },
  },
  {
    name: "recent_news",
    description: "The latest club news posts with how many parents have read each. With `title`, also the parents who haven't read that one.",
    input_schema: { type: "object", properties: { title: str("Part of a post's headline (optional).") } },
  },
  {
    name: "propose_add_sessions",
    description:
      "Draft new sessions for the admin to confirm (nothing is added until they tap Confirm). One date, or weekly on the same weekday until repeat_until. Times are London, 24-hour HH:MM.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["training", "match", "tournament"] },
        title: str("Short title, e.g. 'Training' or 'Autumn Cup'."),
        groups: { type: "array", items: GROUP_ENUM, minItems: 1 },
        date: str("The first (or only) date, YYYY-MM-DD."),
        start: str("Start time HH:MM."),
        end: str("Finish time HH:MM."),
        venue: str("Where. Use the venue the club's recent sessions use if the admin didn't say."),
        repeat_until: str("Optional last date for a weekly repeat, YYYY-MM-DD."),
        arrive_by: str("Optional, e.g. '6:20pm'."),
        kit: str("Optional kit note."),
        notes: str("Optional note for parents."),
      },
      required: ["kind", "title", "groups", "date", "start", "end", "venue"],
    },
  },
  {
    name: "propose_cancel_session",
    description: "Draft cancelling one session (by id from list_sessions) for the admin to confirm, with an optional reason parents see.",
    input_schema: {
      type: "object",
      properties: {
        session_id: str("The session's id."),
        reason: str("Optional reason parents see, e.g. 'Pitch waterlogged'."),
        tell_families: { type: "boolean", description: "Post urgent club news to the families (default true)." },
      },
      required: ["session_id"],
    },
  },
  {
    name: "propose_news",
    description: "Draft a club news post for the admin to confirm. Write it in the admin's words: British English, plain, no emoji, first names only.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", enum: [...TOPICS] },
        title: str("Headline, at most 120 characters."),
        body: str("The message."),
        groups: { type: "array", items: GROUP_ENUM, description: "Only these groups; leave out for every family." },
        ask_to_read: { type: "boolean", description: "Ask parents to tap I've read this (default true)." },
      },
      required: ["topic", "title", "body"],
    },
  },
];

const PAYMENT_WORDS: Record<PaymentState, string> = {
  active: "monthly plan (active)",
  self_reported: "monthly plan (parent says it's set up; to check)",
  overdue: "monthly plan overdue",
  missing: "no payment plan",
  pay_as_you_go: "pay as you go",
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "2026-10-30" for an instant, in London. */
export function isoDay(at: Date): string {
  const d = londonDate(at);
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

const when = (startsAt: string, endsAt?: string) => `${shortDay(startsAt)} ${clock(startsAt)}${endsAt ? `–${clock(endsAt)}` : ""}`;
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const body = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n/g, "\n").trim();
  return t ? t.slice(0, max) : null;
};
const groupsFrom = (v: unknown): AgeGroup[] => (Array.isArray(v) ? AGE_GROUPS.filter((g) => v.includes(g)) : []);
const refuse = (message: string): ToolResult => ({ content: { error: message } });

export async function runTool(tx: Queryable, name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case "find_people":
      return { content: await findPeople(tx, input) };
    case "child_details":
      return { content: await childDetails(tx, input) };
    case "children_needing":
      return { content: await childrenNeeding(tx, input) };
    case "club_overview":
      return { content: await clubOverview(tx, ctx) };
    case "list_sessions":
      return { content: await listSessions(tx, input, ctx) };
    case "who_is_coming":
      return { content: await whoIsComing(tx, input, ctx) };
    case "recent_news":
      return { content: await recentNews(tx, input) };
    case "propose_add_sessions":
      return proposeAddSessions(tx, input, ctx);
    case "propose_cancel_session":
      return proposeCancel(tx, input, ctx);
    case "propose_news":
      return proposeNews(tx, input, ctx);
    default:
      return refuse(`There's no tool called ${name}.`);
  }
}

async function findPeople(tx: Queryable, input: Record<string, unknown>) {
  const name = text(input.name, 60);
  if (!name) return { error: "Give a name to look for." };
  // Every word must match the child's or a parent's name, so "Yusuf Khan" finds Yusuf whose parent is Sara Khan too.
  const words = name.split(" ").slice(0, 4).map(likePattern);
  const rows = await tx.query<{ id: string; first_name: string; last_name: string; age_group: string; parents: string[] | null }>(
    `select p.id, p.first_name, p.last_name, p.age_group::text as age_group,
       array_agg(g.first_name || ' ' || g.last_name order by g.first_name) filter (where g.id is not null) as parents
     from players p
     left join player_guardians pg on pg.player_id = p.id
     left join guardians g on g.id = pg.guardian_id
     where (
       select bool_and(
         p.first_name || ' ' || p.last_name ilike w
         or exists (select 1 from player_guardians x join guardians y on y.id = x.guardian_id
                    where x.player_id = p.id and y.first_name || ' ' || y.last_name ilike w))
       from unnest($1::text[]) w)
     group by p.id
     order by p.first_name, p.last_name limit 20`,
    [words],
  );
  return {
    matches: rows.map((r) => ({
      child_id: r.id,
      child: `${r.first_name} ${r.last_name}`,
      group: r.age_group,
      parents: r.parents ?? [],
      link: `/admin/families/${r.id}`,
    })),
    note: rows.length === 0 ? "Nobody in the app matches that name." : rows.length === 20 ? "Showing the first 20; ask for a fuller name." : undefined,
  };
}

async function childDetails(tx: Queryable, input: Record<string, unknown>) {
  const id = text(input.child_id, 40);
  if (!id || !UUIDISH.test(id)) return { error: "That isn't a child's id. Use find_people first." };
  const c = await loadChild(tx, id);
  if (!c) return { error: "No child with that id." };
  const missing = [
    c.contract ? null : "club contract not signed",
    c.contacts.length === 0 ? "no emergency contact" : null,
    c.photoConsent === null ? "no photo answer" : null,
    c.payment === "missing" ? "no payment plan" : c.payment === "overdue" ? "payment overdue" : null,
  ].filter(Boolean);
  return {
    child: `${c.firstName} ${c.lastName}`,
    group: c.ageGroup,
    date_of_birth: c.dateOfBirth,
    joined: c.joinedOn,
    payment: PAYMENT_WORDS[c.payment],
    contract: c.contract ? `signed ${shortDay(c.contract.signedAt)} by ${c.contract.parentName}` : `not signed (${CONTRACT.id})`,
    photo_consent: c.photoConsent === null ? "not answered" : c.photoConsent ? "yes" : "no",
    emergency_contacts: c.contacts.length,
    to_do_missing: missing,
    sessions_attended: c.attended,
    missed_last_3_sessions: c.missedLast3,
    last_here_this_season: c.lastHereThisSeason ? shortDay(c.lastHereThisSeason) : null,
    parents: c.guardians.map((g) => ({
      name: g.name,
      email: g.email,
      phone: g.phone,
      app: g.inApp ? "signed in" : g.invited ? "invited, not signed in yet" : "not invited yet",
      other_children: g.otherChildren,
    })),
    link: `/admin/families/${c.id}`,
  };
}

async function childrenNeeding(tx: Queryable, input: Record<string, unknown>) {
  if (!isNeed(input.need)) return { error: `Use one of: ${NEED_KEYS.join(", ")}.` };
  const group = isAgeGroup(input.group) ? input.group : null;
  const rows = await loadFamilies(tx, group, AGE_GROUPS, { need: input.need });
  const link = `/admin/families?need=${input.need}${group ? `&group=${group}` : ""}`;
  return {
    what: NEEDS[input.need].label,
    count: rows.length,
    children: rows.slice(0, 40).map((r) => ({
      child_id: r.id,
      child: `${r.firstName} ${r.lastName}`,
      group: r.ageGroup,
      parents: r.guardians.map((g) => g.name),
    })),
    note: rows.length > 40 ? `Showing 40 of ${rows.length}; the full list is on the Families page.` : undefined,
    link,
  };
}

async function clubOverview(tx: Queryable, ctx: ToolContext) {
  const d = await loadDashboard(tx, { now: ctx.now, limit: null, withShop: true, withRequests: false });
  return {
    children: d.players,
    joined_this_month: d.joinedThisMonth,
    parents: { total: d.families.parents, on_the_app: d.families.signedIn, invited_not_signed_in: d.families.invited, not_invited: d.families.notInvited },
    to_do_outstanding: {
      no_emergency_contact: d.families.todo.contacts,
      no_payment_plan_or_overdue: d.families.todo.payment,
      contract_not_signed: d.families.todo.contract,
      no_photo_answer: d.families.todo.consent,
    },
    payment_plans: Object.fromEntries(Object.entries(d.payments).map(([k, v]) => [PAYMENT_WORDS[k as PaymentState], v])),
    season_attendance_percent: d.attendance.seasonPct,
    season_by_group: d.attendance.season.map((g) => ({ group: g.group, children: g.squad })),
    missed_last_3_sessions: d.attendance.missedLast3,
    next_session: d.attendance.next.map((g) => ({
      group: g.group,
      session: g.session ? `${g.session.title}, ${when(g.session.startsAt)}` : "none coming up",
      coming: g.coming,
      not_coming: g.away,
      not_answered: g.unanswered,
    })),
    news_needing_a_tap: d.news.recent.map((n) => ({ title: n.title, read: `${n.read} of ${n.total}` })),
    parents_behind_on_news: d.news.behind,
    staff_needing_dbs_or_certificate: d.staffChecks,
    shop: d.shop ? { awaiting_payment: d.shop.awaitingPayment, to_order: d.shop.toOrder, ready: d.shop.ready, takings_this_month_pence: d.shop.monthPence } : null,
    link: "/admin",
  };
}

function dayStart(day: string | null, fallback: Date): Date {
  const m = day ? DATE.exec(day) : null;
  if (!m) {
    const d = londonDate(fallback);
    return londonTime(d.year, d.month, d.day, 0, 0);
  }
  return londonTime(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0);
}

async function listSessions(tx: Queryable, input: Record<string, unknown>, ctx: ToolContext) {
  const from = dayStart(text(input.from, 10), ctx.now);
  const toDay = text(input.to, 10);
  const to = toDay ? new Date(dayStart(toDay, ctx.now).getTime() + 86400_000) : new Date(from.getTime() + 15 * 86400_000);
  if (to.getTime() - from.getTime() > 120 * 86400_000) return { error: "Ask for at most four months at a time." };
  const group = isAgeGroup(input.group) ? input.group : null;
  const rows = await tx.query<{
    id: string;
    kind: string;
    title: string;
    starts_at: Date;
    ends_at: Date;
    venue: string;
    groups: string[];
    cancelled: boolean;
    cancel_reason: string | null;
    coming: number;
    away: number;
    attended: number;
  }>(
    `select s.id, s.kind::text as kind, s.title, s.starts_at, s.ends_at, s.venue, s.age_groups::text[] as groups,
       s.cancelled_at is not null as cancelled, s.cancel_reason,
       (select count(*)::int from availability v where v.session_id = s.id and v.answer = 'coming') as coming,
       (select count(*)::int from availability v where v.session_id = s.id and v.answer = 'away') as away,
       (select count(*)::int from attendance a where a.session_id = s.id) as attended
     from sessions s
     where s.starts_at >= $1 and s.starts_at < $2 and ($3::text is null or $3 = any (s.age_groups::text[]))
     order by s.starts_at limit 60`,
    [from, to, group],
  );
  return {
    from: isoDay(from),
    to: isoDay(new Date(to.getTime() - 1)),
    sessions: rows.map((r) => {
      const at = new Date(r.starts_at).toISOString();
      return {
        session_id: r.id,
        title: r.title,
        kind: r.kind,
        date: isoDay(new Date(r.starts_at)),
        when: when(at, new Date(r.ends_at).toISOString()),
        groups: r.groups,
        venue: r.venue,
        cancelled: r.cancelled ? (r.cancel_reason ? `yes: ${r.cancel_reason}` : "yes") : "no",
        answers: `${r.coming} coming, ${r.away} not coming`,
        checked_in: r.attended,
        link: `/admin/sessions/${r.id}/edit`,
      };
    }),
    note: rows.length === 0 ? "No sessions in those dates." : undefined,
  };
}

async function whoIsComing(tx: Queryable, input: Record<string, unknown>, ctx: ToolContext) {
  const w = await loadWhoIsComing(tx, ctx.now, null);
  if (!w) return { note: "No sessions coming up." };
  const group = isAgeGroup(input.group) ? input.group : null;
  const kids = w.children.filter((c) => !group || c.group === group);
  const names = (answer: string) =>
    kids.filter((c) => c.answer === answer).map((c) => `${c.firstName} ${c.lastName} (${c.group})${c.reason ? `: ${c.reason}` : ""}`);
  return {
    day: w.day,
    sessions: w.sessions.map((s) => ({ title: s.title, when: when(s.startsAt, s.endsAt), groups: s.groups, venue: s.venue })),
    coming: names("coming"),
    not_coming: names("away"),
    not_answered: names("none"),
    link: `/admin/coming${group ? `?group=${group}` : ""}`,
  };
}

async function recentNews(tx: Queryable, input: Record<string, unknown>) {
  const list = await loadNewsList(tx, 15, null);
  const title = text(input.title, 80)?.toLowerCase() ?? null;
  const picked = title ? list.filter((n) => n.title.toLowerCase().includes(title)) : list;
  const out = picked.slice(0, 10).map((n) => ({
    title: n.title,
    posted: shortDay(n.postedAt),
    read: n.requiresAck ? `${n.readCount} of ${n.audienceCount} parents` : "no read receipts asked for",
    link: `/admin/news/${n.id}`,
  }));
  if (title && picked.length === 1 && picked[0].requiresAck) {
    const detail = await loadNewsDetail(tx, picked[0].id, null);
    return { posts: out, not_read_yet: detail?.unread.map((u) => `${u.name} (${u.children})`) ?? [] };
  }
  return { posts: out, note: picked.length === 0 ? "No post with that headline." : undefined };
}

// Drafts ------------------------------------------------------------------------

async function saveDraft(tx: Queryable, ctx: ToolContext, kind: DraftKind, payload: unknown, summary: string, lines: string[]): Promise<ToolResult> {
  const [{ id }] = await tx.query<{ id: string }>(
    `insert into assistant_actions (staff_id, kind, payload, summary) values ($1, $2, $3::text::jsonb, $4) returning id`,
    [ctx.staffId, kind, JSON.stringify({ ...(payload as object), lines }), summary.slice(0, 300)],
  );
  return {
    content: { draft_id: id, shown_to_admin: summary, status: "Waiting for the admin to tap Confirm. Nothing has changed yet." },
    draft: { id, kind, summary, lines },
  };
}

export type AddSessionsPayload = {
  kind: SessionKind;
  title: string;
  venue: string;
  groups: AgeGroup[];
  times: { start: string; end: string }[];
  arriveBy: string | null;
  kit: string | null;
  notes: string | null;
};

async function proposeAddSessions(tx: Queryable, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const kind = input.kind;
  if (kind !== "training" && kind !== "match" && kind !== "tournament") return refuse("kind must be training, match or tournament.");
  const title = text(input.title, 60);
  const venue = text(input.venue, 120);
  const groups = groupsFrom(input.groups);
  const first = DATE.exec(String(input.date ?? ""));
  const until = input.repeat_until ? DATE.exec(String(input.repeat_until)) : null;
  const start = TIME.exec(String(input.start ?? ""));
  const end = TIME.exec(String(input.end ?? ""));
  if (!title) return refuse("Add a title.");
  if (!venue) return refuse("Add the venue. Ask the admin if you don't know it.");
  if (groups.length === 0) return refuse("Choose at least one group.");
  if (!first) return refuse("date must be YYYY-MM-DD.");
  if (input.repeat_until && !until) return refuse("repeat_until must be YYYY-MM-DD.");
  if (!start || !end) return refuse("start and end must be HH:MM.");
  const minutes = (m: RegExpExecArray) => Number(m[1]) * 60 + Number(m[2]);
  if (minutes(end) <= minutes(start)) return refuse("The finish time must be after the start time.");
  const day0 = Date.UTC(Number(first[1]), Number(first[2]) - 1, Number(first[3]));
  const last = until ? Date.UTC(Number(until[1]), Number(until[2]) - 1, Number(until[3])) : day0;
  if (last < day0) return refuse("repeat_until is before the first date.");
  const days: number[] = [];
  for (let t = day0; t <= last; t += 7 * 86400_000) days.push(t);
  if (days.length > 52) return refuse("That's more than a year of sessions. Add one term at a time.");
  const at = (t: number, m: RegExpExecArray) => {
    const d = new Date(t);
    return londonTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), Number(m[1]), Number(m[2]));
  };
  const times = days.map((t) => ({ start: at(t, start).toISOString(), end: at(t, end).toISOString() }));
  if (new Date(times[0].start) < ctx.now) return refuse("The first date is in the past. Check the date with the admin.");
  // The same check Add sessions makes: a session already starting then for one of these groups is skipped.
  const exists = await tx.query<{ starts_at: Date }>(
    `select starts_at from sessions where starts_at = any ($1::timestamptz[]) and age_groups && $2::text[]::age_group[]`,
    [times.map((t) => t.start), groups],
  );
  const taken = new Set(exists.map((e) => new Date(e.starts_at).toISOString()));
  const fresh = times.filter((t) => !taken.has(t.start));
  if (fresh.length === 0) return refuse("Every one of those sessions already exists, so there's nothing to add.");
  const payload: AddSessionsPayload = {
    kind,
    title,
    venue,
    groups,
    times: fresh,
    arriveBy: text(input.arrive_by, 20),
    kit: text(input.kit, 120),
    notes: body(input.notes, 500),
  };
  const n = fresh.length;
  const summary = `Add ${n} ${n === 1 ? "session" : "sessions"}: ${title} for ${groups.join(", ")}, ${clock(fresh[0].start)}–${clock(fresh[0].end)} at ${venue}`;
  const lines = [
    `Dates: ${fresh.map((t) => shortDay(t.start)).join(", ")}`,
    taken.size ? `Already in the app, so left out: ${times.filter((t) => taken.has(t.start)).map((t) => shortDay(t.start)).join(", ")}` : null,
    payload.arriveBy ? `Arrive by ${payload.arriveBy}` : null,
    payload.kit ? `Kit: ${payload.kit}` : null,
    payload.notes ? `Note for parents: ${payload.notes}` : null,
  ].filter((l): l is string => l !== null);
  return saveDraft(tx, ctx, "add_sessions", payload, summary, lines);
}

export type CancelPayload = { sessionId: string; reason: string | null; tell: boolean };

async function proposeCancel(tx: Queryable, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const id = text(input.session_id, 40);
  if (!id || !UUIDISH.test(id)) return refuse("Use a session id from list_sessions.");
  const [s] = await tx.query<{ title: string; starts_at: Date; ends_at: Date; groups: string[]; cancelled: boolean }>(
    `select title, starts_at, ends_at, age_groups::text[] as groups, cancelled_at is not null as cancelled from sessions where id = $1`,
    [id],
  );
  if (!s) return refuse("No session with that id.");
  if (s.cancelled) return refuse("That session is already cancelled.");
  const reason = text(input.reason, 120);
  const tell = input.tell_families !== false;
  const payload: CancelPayload = { sessionId: id, reason, tell };
  const summary = `Cancel ${s.title}, ${when(new Date(s.starts_at).toISOString(), new Date(s.ends_at).toISOString())} (${s.groups.join(", ")})`;
  const lines = [reason ? `Reason parents see: ${reason}` : "No reason given", tell ? "The families are told now in club news, by app notification and email" : "The families aren't told"];
  return saveDraft(tx, ctx, "cancel_session", payload, summary, lines);
}

export type NewsPayload = { topic: string; title: string; body: string; groups: AgeGroup[] | null; requiresAck: boolean };

async function proposeNews(tx: Queryable, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const topic = TOPICS.find((t) => t === input.topic);
  const title = text(input.title, 120);
  const message = body(input.body, 4000);
  if (!topic) return refuse(`topic must be one of ${TOPICS.join(", ")}.`);
  if (!title) return refuse("Add a headline.");
  if (!message) return refuse("Write the message.");
  const groups = Array.isArray(input.groups) && input.groups.length ? groupsFrom(input.groups) : null;
  if (groups && groups.length === 0) return refuse("Those aren't the club's groups.");
  const requiresAck = input.ask_to_read !== false;
  const payload: NewsPayload = { topic, title, body: message, groups, requiresAck };
  const lines = [`To: ${groups ? groups.join(", ") : "every family"}`, message, requiresAck ? "Parents are asked to tap I've read this" : "No read receipts"];
  return saveDraft(tx, ctx, "post_news", payload, `Post news: ${title}`, lines);
}
