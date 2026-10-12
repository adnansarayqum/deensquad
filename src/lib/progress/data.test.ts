// Ratings, progress reports and the switch that shows them to parents (migration 0026), as different signed-in
// people on PGlite with the sample club.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { londonIsoDate } from "@/lib/dates";
import { progressForParents, setProgressForParents } from "@/lib/settings";
import { testDatabase } from "../../../test/db";
import { loadGroupAverages, loadPlayerRatings, loadProgress, loadRateRows, loadRateSessions, loadReport, loadReports, saveReport, saveSessionRatings } from "./data";
import { firstOfMonth } from "./ratings";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // parent of Yusuf (U10) and Musa (U7)
let other: string; // parent of one U10 child
let admin: string;
let coach: string;
let adminStaff: string;
let coachStaff: string;
let lastFriday: string;
let futureFriday: string;
// A Tuesday at noon (the latest one), so last Friday's session is over and the coming one is ahead whatever day the
// tests run; the sample club is seeded around it.
const real = new Date();
const now = new Date(Date.UTC(real.getUTCFullYear(), real.getUTCMonth(), real.getUTCDate() - ((real.getUTCDay() + 5) % 7), 12));
const today = londonIsoDate(now);
const month = firstOfMonth(today);
const FOURS = { technique: 4, game_understanding: 4, physical: 4, attitude: 4, teamwork: 4 };

beforeAll(async () => {
  t = await testDatabase({ seed: true, now });
  adnan = await t.signIn(DEV_EMAILS.parent);
  other = await t.signIn("parent1@example.com");
  admin = await t.signIn(DEV_EMAILS.admin);
  coach = await t.signIn(DEV_EMAILS.coach);
  [{ id: adminStaff }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  [{ id: coachStaff }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.coach]));
  [{ id: lastFriday }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(`select id from sessions where starts_at < $1 and title = 'Training' order by starts_at desc limit 1`, [now]),
  );
  [{ id: futureFriday }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(`select id from sessions where starts_at > $1 and title = 'Training' order by starts_at limit 1`, [now]),
  );
});

describe("the database", () => {
  it("refuses a score outside 1 to 5", async () => {
    for (const bad of [0, 6]) {
      await expect(
        t.asSystem((tx) =>
          tx.query(`insert into player_ratings (player_id, technique, game_understanding, physical, attitude, teamwork) values ($1, $2, 3, 3, 3, 3)`, [
            DEV_IDS.yusuf,
            bad,
          ]),
        ),
      ).rejects.toThrow(/check constraint/);
    }
    await expect(
      t.asSystem((tx) => tx.query(`insert into player_ratings (player_id, technique, game_understanding, physical, attitude) values ($1, 3, 3, 3, 3)`, [DEV_IDS.yusuf])),
    ).rejects.toThrow(/null/);
  });

  it("lets only an admin change the setting", async () => {
    expect(await t.asUser(adnan, progressForParents)).toBe(false);
    await expect(t.asUser(coach, (tx) => setProgressForParents(tx, true, coachStaff))).rejects.toThrow(/row-level security/);
    await expect(t.asUser(adnan, (tx) => tx.query(`insert into club_settings (key, value) values ('progress_for_parents', 'true')`))).rejects.toThrow(
      /row-level security/,
    );
    expect(await t.asUser(adnan, progressForParents)).toBe(false);
    // Everyone signed in can read it; nobody signed out.
    expect(await t.asUser(adnan, (tx) => tx.query(`select 1 from club_settings`))).toHaveLength(0);
  });
});

describe("rating a session", () => {
  it("lists the session's children, checked-in first, and saves complete rows", async () => {
    const sessions = await t.asUser(coach, (tx) => loadRateSessions(tx, now, ["U7", "U10"]));
    expect(sessions[0]?.id).toBe(lastFriday);
    expect(sessions.map((s) => s.id)).not.toContain(futureFriday);
    const rows = await t.asUser(coach, (tx) => loadRateRows(tx, lastFriday, "U10", coachStaff));
    expect(rows[0]).toMatchObject({ firstName: "Yusuf", here: true, mine: null });
    expect(rows.slice(1).every((r) => !r.here)).toBe(true);

    const saved = await t.asUser(coach, (tx) =>
      saveSessionRatings(tx, { sessionId: lastFriday, staffId: coachStaff, groups: ["U7", "U10"], now, ratings: [{ playerId: DEV_IDS.yusuf, scores: FOURS }] }),
    );
    expect(saved).toEqual({ saved: 1 });
    // Re-rating the same session replaces it.
    await t.asUser(coach, (tx) =>
      saveSessionRatings(tx, {
        sessionId: lastFriday,
        staffId: coachStaff,
        groups: ["U7", "U10"],
        now,
        ratings: [{ playerId: DEV_IDS.yusuf, scores: { ...FOURS, technique: 5 } }],
      }),
    );
    const again = await t.asUser(coach, (tx) => loadRateRows(tx, lastFriday, "U10", coachStaff));
    expect(again[0].mine).toEqual({ ...FOURS, technique: 5 });
    const all = await t.asSystem((tx) => tx.query(`select 1 from player_ratings where player_id = $1`, [DEV_IDS.yusuf]));
    expect(all).toHaveLength(1);
  });

  it("refuses a child outside the coach's groups, a future session, and a child not in the session", async () => {
    const outside = await t.asUser(coach, (tx) =>
      saveSessionRatings(tx, { sessionId: lastFriday, staffId: coachStaff, groups: ["U7"], now, ratings: [{ playerId: DEV_IDS.yusuf, scores: FOURS }] }),
    );
    expect(outside).toEqual({ error: "You can rate children in your own groups only. Yusuf isn't in them." });
    const future = await t.asUser(coach, (tx) =>
      saveSessionRatings(tx, { sessionId: futureFriday, staffId: coachStaff, groups: ["U10"], now, ratings: [{ playerId: DEV_IDS.yusuf, scores: FOURS }] }),
    );
    expect(future).toEqual({ error: "You can rate a session on its day or after, and not once it's cancelled." });
    const [{ id: cup }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where title = 'Autumn Cup'`));
    await t.asSystem((tx) => tx.query(`update sessions set starts_at = $2::timestamptz - interval '2 days', ends_at = $2::timestamptz - interval '2 days' + interval '2 hours' where id = $1`, [cup, now]));
    const musa = await t.asUser(coach, (tx) =>
      saveSessionRatings(tx, { sessionId: cup, staffId: coachStaff, groups: ["U7", "U10"], now, ratings: [{ playerId: DEV_IDS.musa, scores: FOURS }] }),
    );
    expect(musa).toEqual({ error: "Musa isn't in this session." });
  });

  it("averages a group this month for staff", async () => {
    const averages = await t.asUser(admin, (tx) => loadGroupAverages(tx, ["U7", "U10"], today));
    // The rating is dated the session's day, which may be last month early in a month.
    const lastFridayDay = (await t.asSystem((tx) => tx.query<{ d: string }>(`select (starts_at at time zone 'Europe/London')::date::text as d from sessions where id = $1`, [lastFriday])))[0].d;
    if (lastFridayDay >= month) expect(averages).toEqual([{ group: "U10", count: 1, children: 1, scores: { ...FOURS, technique: 5 } }]);
    else expect(averages).toEqual([]);
  });
});

describe("what parents see", () => {
  beforeAll(async () => {
    await t.asUser(admin, (tx) => saveReport(tx, { playerId: DEV_IDS.yusuf, month, body: "Yusuf has had a great month.", staffId: adminStaff, publish: true }));
    await t.asUser(admin, (tx) => saveReport(tx, { playerId: DEV_IDS.musa, month, body: "Draft for Musa.", staffId: adminStaff, publish: false }));
  });

  it("sees nothing while progress is off, even for their own child", async () => {
    expect(await t.asUser(adnan, (tx) => loadPlayerRatings(tx, DEV_IDS.yusuf, today))).toEqual([]);
    expect(await t.asUser(adnan, (tx) => loadReports(tx, DEV_IDS.yusuf))).toEqual([]);
    expect(await t.asUser(adnan, (tx) => tx.query(`select 1 from player_ratings`))).toHaveLength(0);
  });

  it("sees their own child's ratings and published reports once an admin switches it on; never another child's or a draft", async () => {
    expect(await t.asUser(admin, (tx) => setProgressForParents(tx, true, adminStaff))).toBe(false);
    expect(await t.asUser(adnan, progressForParents)).toBe(true);
    const mine = await t.asUser(adnan, (tx) => loadProgress(tx, DEV_IDS.yusuf, today));
    expect(mine.count).toBe(1);
    expect(mine.current).toEqual({ ...FOURS, technique: 5 });
    expect(mine.last?.by).toBe("Coach Hamza");
    const reports = await t.asUser(adnan, (tx) => loadReports(tx, DEV_IDS.yusuf, { published: true }));
    expect(reports.map((r) => r.body)).toEqual(["Yusuf has had a great month."]);
    expect(reports[0].by).toBe("Ibrahim Khan");
    // Musa's report is a draft.
    expect(await t.asUser(adnan, (tx) => loadReports(tx, DEV_IDS.musa))).toEqual([]);
    // Another family sees none of Yusuf's.
    expect(await t.asUser(other, (tx) => loadPlayerRatings(tx, DEV_IDS.yusuf, today))).toEqual([]);
    expect(await t.asUser(other, (tx) => loadReports(tx, DEV_IDS.yusuf))).toEqual([]);
    expect(await t.asUser(other, (tx) => tx.query(`select 1 from player_ratings`))).toHaveLength(0);
    // Parents still can't write either.
    await expect(
      t.asUser(adnan, (tx) => tx.query(`insert into player_ratings (player_id, technique, game_understanding, physical, attitude, teamwork) values ($1, 5, 5, 5, 5, 5)`, [DEV_IDS.yusuf])),
    ).rejects.toThrow(/row-level security/);
    expect(await t.asUser(adnan, (tx) => tx.query(`update progress_reports set body = 'x' returning id`))).toHaveLength(0);
  });

  it("hides it all again when switched off", async () => {
    await t.asUser(admin, (tx) => setProgressForParents(tx, false, adminStaff));
    expect(await t.asUser(adnan, (tx) => loadReports(tx, DEV_IDS.yusuf))).toEqual([]);
    expect(await t.asUser(adnan, (tx) => loadPlayerRatings(tx, DEV_IDS.yusuf, today))).toEqual([]);
  });
});

describe("publishing a report", () => {
  it("emails once, only while progress is on, and never for a report published while it was off", async () => {
    const nextMonth = firstOfMonth(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 15)).toISOString().slice(0, 10));
    // Published while off (the Yusuf report above): switching on sends nothing by itself, and its row isn't marked.
    const [yusuf] = await t.asSystem((tx) => tx.query<{ emailed: boolean }>(`select emailed_at is not null as emailed from progress_reports where player_id = $1`, [DEV_IDS.yusuf]));
    expect(yusuf.emailed).toBe(false);
    await t.asUser(admin, (tx) => setProgressForParents(tx, true, adminStaff));
    const save = (body: string, publish: boolean) =>
      t.asUser(coach, async (tx) => ({ email: (await saveReport(tx, { playerId: DEV_IDS.musa, month: nextMonth, body, staffId: coachStaff, publish })).email }));
    expect(await save("Draft.", false)).toEqual({ email: false });
    expect(await save("Musa's month.", true)).toEqual({ email: true });
    expect(await save("Musa's month, edited.", true)).toEqual({ email: false });
    // Back to a draft hides it; publishing again doesn't email twice.
    expect(await save("Musa's month, edited.", false)).toEqual({ email: false });
    expect((await t.asUser(coach, (tx) => loadReport(tx, DEV_IDS.musa, nextMonth)))?.publishedAt).toBeNull();
    expect(await save("Musa's month, edited.", true)).toEqual({ email: false });
    await t.asUser(admin, (tx) => setProgressForParents(tx, false, adminStaff));
  });
});
