import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { addDays, nextFridaySession } from "../dates";
import { DEV_EMAILS } from "../db/dev-seed";
import { BULK_MAX, applyPatch, bulkCancel, bulkDelete, bulkEdit, bulkNotice, bulkResultQuery, parseIds } from "./bulk-sessions";
import { loadAdminSessions } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let coach: string;
let admin: string;
let adminStaffId: string;
let cup: string;
let friday: string;
let nextFriday: string;
const now = new Date();
const coming = nextFridaySession(now);

beforeEach(async () => {
  t = await testDatabase({ seed: true, now });
  coach = await t.signIn(DEV_EMAILS.coach);
  admin = await t.signIn(DEV_EMAILS.admin);
  [{ id: adminStaffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  [{ id: cup }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where title = 'Autumn Cup'`));
  [{ id: friday }, { id: nextFriday }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(`select id from sessions where starts_at in ($1, $2) order by starts_at`, [coming.start, addDays(coming.start, 7)]),
  );
});

const addU7 = (title: string, daysAhead: number) =>
  t.asSystem(async (tx) => {
    const [{ id }] = await tx.query<{ id: string }>(
      `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups)
       values ('training', $1, now() + ($2 || ' days')::interval, now() + ($2 || ' days 1 hour')::interval, 'Hub', '{U7}') returning id`,
      [title, String(daysAhead)],
    );
    return id;
  });

const row = (id: string) =>
  t.asSystem(async (tx) => (await tx.query<{ venue: string; starts_at: Date; ends_at: Date; title: string; cancelled_at: Date | null; cancel_reason: string | null }>(`select venue, starts_at, ends_at, title, cancelled_at, cancel_reason from sessions where id = $1`, [id]))[0]);

describe("parseIds", () => {
  it("reads a comma list or a form's values, dropping junk and repeats", () => {
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    expect(parseIds(`${a},${b},${a},nope`)).toEqual([a, b]);
    expect(parseIds([a, "x", b])).toEqual([a, b]);
    expect(parseIds(undefined)).toEqual([]);
  });
});

describe("bulk edit", () => {
  it("applies only the filled-in fields, keeping each session's own times and the rest", async () => {
    const before = await Promise.all([row(friday), row(nextFriday)]);
    const result = await t.asUser(admin, (tx) => bulkEdit(tx, [friday, nextFriday], { venue: "Valentines Park" }, null, false, adminStaffId));
    expect(result.done.sort()).toEqual([friday, nextFriday].sort());
    expect(result.skipped).toEqual([]);
    expect(result.news).toEqual([]);
    const after = await Promise.all([row(friday), row(nextFriday)]);
    for (const [i, s] of after.entries()) {
      expect(s.venue).toBe("Valentines Park");
      expect(s.title).toBe(before[i].title);
      expect(s.starts_at.toISOString()).toBe(before[i].starts_at.toISOString());
      expect(s.ends_at.toISOString()).toBe(before[i].ends_at.toISOString());
    }
  });

  it("puts a new start time on each session's own day and skips one whose finish would come first", async () => {
    const result = await t.asUser(admin, (tx) => bulkEdit(tx, [friday, nextFriday], { start: { hour: 19, minute: 0 } }, null, false, adminStaffId));
    expect(result.done).toHaveLength(2);
    const a = await row(friday);
    const b = await row(nextFriday);
    expect(b.starts_at.getTime() - a.starts_at.getTime()).toBe(7 * 86400000);
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(a.starts_at)).toBe("19:00");
    // A finish before the (kept) start is skipped and named, the rest still saved.
    const bad = await t.asUser(admin, (tx) => bulkEdit(tx, [friday], { end: { hour: 18, minute: 0 } }, null, false, adminStaffId));
    expect(bad.done).toEqual([]);
    expect(bad.skipped).toMatchObject([{ id: friday, why: "times" }]);
  });

  it("for a U7 coach, changes U7-only sessions and reports the others as not theirs", async () => {
    const extra = await addU7("U7 extra", 3);
    const result = await t.asUser(coach, (tx) => bulkEdit(tx, [cup, extra, friday], { title: "Renamed" }, ["U7"], false, adminStaffId));
    expect(result.done).toEqual([extra]);
    expect(result.skipped.filter((s) => s.why === "not_yours")).toHaveLength(2);
    expect((await row(extra)).title).toBe("Renamed");
    expect((await row(cup)).title).toBe("Autumn Cup");
    // Nor to groups outside theirs.
    const toU10 = await t.asUser(coach, (tx) => bulkEdit(tx, [extra], { groups: ["U10"] }, ["U7"], false, adminStaffId));
    expect(toU10.done).toEqual([]);
  });

  it("with 'tell the families' posts one changed notice per session", async () => {
    const result = await t.asUser(admin, (tx) => bulkEdit(tx, [friday, nextFriday], { venue: "Away pitch" }, null, true, adminStaffId));
    expect(result.news).toHaveLength(2);
    const rows = await t.asSystem((tx) => tx.query<{ title: string; urgent: boolean }>(`select title, urgent from announcements where id = any($1::uuid[])`, [result.news]));
    expect(rows.every((r) => r.urgent && / has changed$/.test(r.title))).toBe(true);
  });

  it("lays the patch over a session (pure)", () => {
    const s = { ...({} as import("./data").AdminSession), title: "Training", kind: "training" as const, venue: "Hub", ageGroups: ["U7" as const], startsAt: "2026-10-09T17:30:00.000Z", endsAt: "2026-10-09T19:00:00.000Z", arriveBy: null, kit: "Boots", prayerNote: null, notes: null };
    const edit = applyPatch(s, { venue: "Park", end: { hour: 20, minute: 30 } });
    expect(edit).toMatchObject({ title: "Training", venue: "Park", kit: "Boots", groups: ["U7"] });
    expect(edit.start.toISOString()).toBe("2026-10-09T17:30:00.000Z");
    expect(edit.end.toISOString()).toBe("2026-10-09T19:30:00.000Z"); // 20:30 BST
  });
});

describe("bulk cancel and restore", () => {
  it("cancels each with the one reason, skips already cancelled ones and posts one notice per session cancelled", async () => {
    await t.asSystem((tx) => tx.query(`update sessions set cancelled_at = now(), cancel_reason = 'Snow' where id = $1`, [cup]));
    const result = await t.asUser(admin, (tx) => bulkCancel(tx, [friday, nextFriday, cup], true, null, "Half term", true, adminStaffId));
    expect(result.done.sort()).toEqual([friday, nextFriday].sort());
    expect(result.skipped).toMatchObject([{ id: cup, why: "already" }]);
    expect(result.news).toHaveLength(2);
    expect((await row(friday)).cancel_reason).toBe("Half term");
    expect((await row(cup)).cancel_reason).toBe("Snow");
    const notices = await t.asSystem((tx) => tx.query<{ title: string }>(`select title from announcements where id = any($1::uuid[]) order by title`, [result.news]));
    expect(notices.map((n) => n.title)).toEqual(expect.arrayContaining([expect.stringMatching(/^Training on .+ is cancelled$/)]));
    expect(notices).toHaveLength(2);

    // Restore: the mirror, skipping the one that isn't cancelled.
    await t.asSystem((tx) => tx.query(`update sessions set cancelled_at = null, cancel_reason = null where id = $1`, [cup]));
    const back = await t.asUser(admin, (tx) => bulkCancel(tx, [friday, nextFriday, cup], false, null, null, false, adminStaffId));
    expect(back.done).toHaveLength(2);
    expect(back.skipped).toMatchObject([{ id: cup, why: "already" }]);
    expect(back.news).toEqual([]);
    expect((await row(friday)).cancel_reason).toBeNull();
  });

  it("for a U7 coach leaves joint sessions alone and counts them", async () => {
    const extra = await addU7("U7 extra", 3);
    const result = await t.asUser(coach, (tx) => bulkCancel(tx, [friday, extra], true, ["U7"], null, false, adminStaffId));
    expect(result.done).toEqual([extra]);
    expect(result.skipped).toMatchObject([{ why: "not_yours" }]);
    expect((await row(friday)).cancelled_at).toBeNull();
  });

  it("takes at most the cap", async () => {
    const ids: string[] = [];
    for (let i = 0; i < BULK_MAX + 1; i++) ids.push(await addU7(`Run ${i}`, 10 + i));
    const result = await t.asUser(admin, (tx) => bulkCancel(tx, ids, true, null, null, false, adminStaffId));
    expect(result.done).toHaveLength(BULK_MAX);
    expect((await row(ids[BULK_MAX])).cancelled_at).toBeNull();
  });
});

describe("bulk delete", () => {
  it("keeps a session with a check-in, names it, and deletes the rest with their plan files", async () => {
    const [a, b] = [await addU7("U7 a", 3), await addU7("U7 b", 4)];
    const [{ id: yusuf }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where first_name = 'Yusuf'`));
    const [{ id: file }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`insert into club_files (name, mime, size, data) values ('plan.pdf', 'application/pdf', 4, '\x25504446') returning id`),
    );
    await t.asSystem(async (tx) => {
      await tx.query(`insert into session_plans (session_id, age_group, body, file_id, author) values ($1, 'U7', 'Passing', $2, $3)`, [b, file, adminStaffId]);
      await tx.query(`insert into attendance (session_id, player_id) values ($1, $2)`, [a, yusuf]);
    });
    const result = await t.asUser(admin, (tx) => bulkDelete(tx, [a, b], null));
    expect(result.done).toEqual([b]);
    expect(result.skipped).toMatchObject([{ id: a, why: "checked_in", title: "U7 a" }]);
    expect(await row(a)).toBeDefined();
    expect(await row(b)).toBeUndefined();
    expect(await t.asSystem((tx) => tx.query(`select 1 from club_files where id = $1`, [file]))).toEqual([]);
    const { sessions } = await t.asUser(admin, (tx) => loadAdminSessions(tx, [a, b], null));
    expect(sessions.map((s) => s.id)).toEqual([a]);
  });
});

describe("the notice back on Sessions", () => {
  it("round-trips through the query string", () => {
    const skipped = { id: "x", day: "Fri 9 Oct", title: "Training" } as const;
    expect(bulkNotice(Object.fromEntries(new URLSearchParams(bulkResultQuery("cancel", { done: ["a", "b"], skipped: [{ ...skipped, why: "already" }], news: ["n"], squadRemoved: 0 }))))).toBe(
      "Cancelled 2 sessions. 1 skipped (Fri 9 Oct): already cancelled. The families have been told.",
    );
    expect(bulkNotice(Object.fromEntries(new URLSearchParams(bulkResultQuery("delete", { done: ["a", "b", "c", "d", "e"], skipped: [{ ...skipped, why: "checked_in" }], news: [], squadRemoved: 0 }))))).toBe(
      "Deleted 5 sessions. 1 kept (Fri 9 Oct): children have been checked in.",
    );
    expect(
      bulkNotice(Object.fromEntries(new URLSearchParams(bulkResultQuery("edit", { done: ["a"], skipped: [{ id: "", day: "", title: "", why: "not_yours" }, { id: "", day: "", title: "", why: "not_yours" }], news: [], squadRemoved: 1 })))),
    ).toBe("Updated 1 session. 2 skipped: not your groups. 1 child no longer in the groups came out of a squad.");
    expect(bulkNotice({ bulk: "restore", done: "0" })).toBe("No sessions put back on.");
    expect(bulkNotice({ bulk: "restore", done: "2", skipped: "1", which: "Fri 9 Oct" })).toBe("Put 2 sessions back on. 1 skipped (Fri 9 Oct): not cancelled.");
    expect(bulkNotice({ bulk: "toomany" })).toBe(`Choose up to ${BULK_MAX} sessions at a time.`);
    expect(bulkNotice({ bulk: "none" })).toBe("Tick the sessions you want to change first.");
    expect(bulkNotice({})).toBeNull();
    expect(bulkNotice({ bulk: "drop" })).toBeNull();
  });
});
