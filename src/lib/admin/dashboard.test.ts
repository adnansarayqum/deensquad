import { describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { averagePct, loadDashboard, monthStart } from "./dashboard";
import { countBehindOnNews, loadFamilies } from "./data";
import { applyImport, planImport } from "./import";
import { TODO_NEEDS } from "./needs";

// A Monday in October: the six seeded past Fridays (28 Aug to 2 Oct) all fall in this season.
const OCTOBER = new Date("2026-10-05T09:00:00Z");
// A Thursday in August: of the six past Fridays (10 Jul to 14 Aug) only 7 and 14 Aug are this season.
const AUGUST = new Date("2026-08-20T09:00:00Z");

async function seeded(now: Date) {
  const t = await testDatabase({ seed: true, now });
  const admin = await t.signIn(DEV_EMAILS.admin);
  return { t, admin };
}

describe("admin overview numbers", () => {
  it("counts the sample club for an admin", async () => {
    const { t, admin } = await seeded(OCTOBER);
    // Two orders paid this month, one waiting for a transfer, one cancelled (never counted).
    await t.asSystem((tx) =>
      tx.query(
        `insert into shop_orders (status, pay_by, total_pence, paid_at) values
           ('paid', 'bank', 2500, '2026-10-02T10:00:00Z'),
           ('ready', 'card', 1000, '2026-10-01T10:00:00Z'),
           ('collected', 'card', 700, '2026-09-10T10:00:00Z'),
           ('awaiting_payment', 'bank', 900, null),
           ('cancelled', 'card', 5000, '2026-10-03T10:00:00Z')`,
      ),
    );
    const [winter] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from announcements where title like 'Winter%'`));
    await t.asSystem((tx) =>
      tx.query(
        `insert into announcement_chases (announcement_id, guardian_id, channel, sent_at) values
           ($1, $2, 'email', $3), ($1, $2, 'whatsapp', $3), ($1, $2, 'app', $4)`,
        [winter.id, DEV_IDS.sara, new Date(OCTOBER.getTime() - 2 * 86400000), new Date(OCTOBER.getTime() - 9 * 86400000)],
      ),
    );

    const d = await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: null, withShop: true }));

    expect(d.players).toBe(21);
    // This Friday: 11 of the 16 U10s coming, 2 away; no U7 answers yet. Groups with no players still appear (with a squad of 0).
    const u10 = d.attendance.next.find((g) => g.group === "U10")!;
    expect(u10).toMatchObject({ squad: 16, coming: 11, away: 2, unanswered: 3 });
    expect(u10.session?.title).toBe("Training");
    expect(d.attendance.next.find((g) => g.group === "U7")).toMatchObject({ squad: 5, coming: 0, away: 0, unanswered: 5 });
    expect(d.attendance.next.map((g) => g.group)).toEqual(["U6", "U7", "U10", "U12", "U15", "Girls"]);
    // Season: six Fridays have passed, but "held" counts only those where the group's register was
    // taken (someone from it checked in). Yusuf came to five of them (5 of 5 × 16 U10 places = 6%),
    // Musa to two (2 of 2 × 5 U7 places = 20%).
    expect(d.attendance.season.find((g) => g.group === "U10")).toMatchObject({ held: 5, checkedIn: 5, averagePct: 6 });
    expect(d.attendance.season.find((g) => g.group === "U7")).toMatchObject({ held: 2, checkedIn: 2, averagePct: 20 });
    expect(d.attendance.season.find((g) => g.group === "U12")).toMatchObject({ squad: 0, averagePct: null });
    // The chart: this season's sessions with a register taken (4 Sept had nobody in), each group's share and the total.
    expect(d.attendance.sessions.map((s) => [s.checkedIn, s.expected, s.pct, s.groups.map((g) => `${g.group} ${g.checkedIn}/${g.expected}`).join(",")])).toEqual([
      [1, 16, 6, "U10 1/16"],
      [1, 16, 6, "U10 1/16"],
      [1, 16, 6, "U10 1/16"],
      [2, 21, 10, "U7 1/5,U10 1/16"],
      [2, 21, 10, "U7 1/5,U10 1/16"],
    ]);
    // The headline figure: every group's check-ins over every group's expected places (5 + 2 of 80 + 10).
    expect(d.attendance.seasonPct).toBe(8);

    expect(d.families).toMatchObject({ parents: 21, signedIn: 0, invited: 0, notInvited: 21 });
    // Only Yusuf has a contact, a photo answer and an active plan; nobody has signed the contract yet.
    expect(d.families.todo).toEqual({ contacts: 20, payment: 20, contract: 21, consent: 20 });
    expect(d.payments).toEqual({ active: 1, self_reported: 0, missing: 20, overdue: 0 });

    expect(d.shop).toEqual({ awaitingPayment: 1, toOrder: 1, ordered: 0, ready: 1, orders: 5, monthPence: 3500, seasonPence: 4200 });

    // Newest first: the U10 kit message (17 parents), winter timings and payments (everyone, Adnan read both).
    expect(d.news.recent.map((n) => [n.title.slice(0, 12), n.read, n.total])).toEqual([
      ["New away kit", 0, 17],
      ["Winter timin", 1, 21],
      ["Monthly plan", 1, 21],
    ]);
    // Reminders in the last seven days only (the app one was nine days ago).
    expect(d.news.reminders).toEqual({ app: 0, email: 1, sms: 0, whatsapp: 1, gate: 0 });
    // Everyone but Adnan (who has only the kit message left) has two or more unread.
    expect(d.news.behind).toBe(20);
  });

  it("matches each to-do count to the Families list it links to", async () => {
    const { t, admin } = await seeded(OCTOBER);
    await t.asSystem((tx) => tx.query(`insert into payment_status (player_id, state) values ($1, 'overdue')`, [DEV_IDS.musa]));
    const d = await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: null, withShop: true }));
    for (const need of TODO_NEEDS) {
      const rows = await t.asUser(admin, (tx) => loadFamilies(tx, null, undefined, { need }));
      expect(rows.length, need).toBe(d.families.todo[need]);
    }
    // Overdue still counts as "no payment plan" on the To-do, and shows on its own in Payments.
    expect(d.payments.overdue).toBe(1);
    expect((await t.asUser(admin, (tx) => loadFamilies(tx, null, undefined, { need: "overdue" }))).map((r) => r.firstName)).toEqual(["Musa"]);
    expect(d.families.todo.payment).toBe(20);
  });

  it("keeps past attendance when new children join", async () => {
    const { t, admin } = await seeded(OCTOBER);
    const season = async () => (await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: null, withShop: false }))).attendance.season;
    const before = (await season()).find((g) => g.group === "U10")!;
    expect(before).toMatchObject({ squad: 16, held: 5, checkedIn: 5, expected: 80, averagePct: 6 });

    // An import adds 40 U10s today, after every past session (and one checked in at a past session still counts).
    const csv = ["Child first name,Child last name,Age group,Parent first name,Parent email"];
    for (let i = 1; i <= 40; i++) csv.push(`New${i},Child,U10,Parent,new${i}@example.com`);
    await t.asUser(admin, (tx) => applyImport(tx, planImport(csv.join("\n"), OCTOBER)));
    const after = (await season()).find((g) => g.group === "U10")!;
    expect(after).toMatchObject({ squad: 56, held: 5, checkedIn: 5, expected: 80, averagePct: 6 });

    // A child who joined part-way through counts only from then: Bilal joined before the last two Fridays and came to one.
    const [bilal] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where first_name = 'Bilal'`));
    const recent = await t.asSystem((tx) =>
      tx.query<{ id: string; day: string }>(
        `select id, (starts_at at time zone 'Europe/London')::date::text as day from sessions where ends_at <= $1 order by starts_at desc limit 2`,
        [OCTOBER],
      ),
    );
    await t.asSystem(async (tx) => {
      await tx.query(`update players set joined_on = $2::date where id = $1`, [bilal.id, recent[1].day]);
      await tx.query(`insert into attendance (session_id, player_id) values ($1, $2)`, [recent[0].id, bilal.id]);
    });
    // 6 check-ins over 16 places at each of the last two Fridays and 15 at the three before: 6 / 77.
    expect((await season()).find((g) => g.group === "U10")).toMatchObject({ held: 5, checkedIn: 6, expected: 77, averagePct: 8 });
  });

  it("matches the parents behind on news to the Families list it links to", async () => {
    const { t, admin } = await seeded(OCTOBER);
    // A parent added after every message was posted isn't behind (and isn't chased); they can still read them.
    await t.asUser(admin, (tx) => applyImport(tx, planImport("Child name,Age group,Parent name,Email\nLate Comer,U10,Lena Comer,lena@example.com", OCTOBER)));
    const d = await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: null, withShop: false }));
    expect(d.news.behind).toBe(20);
    expect(await t.asUser(admin, (tx) => countBehindOnNews(tx, { group: null, need: "unread", search: null }))).toBe(20);
    const children = await t.asUser(admin, (tx) => loadFamilies(tx, null, undefined, { need: "unread" }));
    // Every child but Late Comer: Yusuf and Musa through Sara, the rest through their one parent each.
    expect(children).toHaveLength(21);
    expect(children.map((c) => c.firstName)).not.toContain("Late");

    // A U7 coach: the same rule over their own groups.
    const u7 = await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: ["U7"], withShop: false }));
    expect(await t.asUser(admin, (tx) => countBehindOnNews(tx, { group: null, need: "unread", search: null }, ["U7"]))).toBe(u7.news.behind);

    // Reading one more message takes a parent off both.
    const [winter] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from announcements where title like 'Winter%'`));
    const [p1] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from guardians where email = 'parent16@example.com'`)); // a U7 parent: two messages unread
    await t.asSystem((tx) => tx.query(`insert into announcement_reads (announcement_id, guardian_id) values ($1, $2)`, [winter.id, p1.id]));
    const again = await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: null, withShop: false }));
    expect(again.news.behind).toBe(19);
    expect(await t.asUser(admin, (tx) => countBehindOnNews(tx, { group: null, need: "unread", search: null }))).toBe(19);
  });

  it("starts the season on 1 August", async () => {
    const { t, admin } = await seeded(AUGUST);
    const d = await t.asUser(admin, (tx) => loadDashboard(tx, { now: AUGUST, limit: null, withShop: false }));
    // 7 and 14 August only. Yusuf and Musa both came to those two.
    expect(d.attendance.season.find((g) => g.group === "U10")).toMatchObject({ held: 2, checkedIn: 2, averagePct: 6 });
    expect(d.attendance.season.find((g) => g.group === "U7")).toMatchObject({ held: 2, checkedIn: 2, averagePct: 20 });
    // The chart is this season's sessions only.
    expect(d.attendance.sessions.map((s) => s.checkedIn)).toEqual([2, 2]);
    expect(d.shop).toBeNull();
    expect(monthStart(AUGUST).toISOString()).toBe("2026-07-31T23:00:00.000Z");
  });

  it("averages attendance over sessions where the register was taken", async () => {
    const t = await testDatabase();
    await t.asSystem(async (tx) => {
      await tx.query(`insert into staff (email, display_name, role) values ('owner@deensquad.test', 'Owner', 'admin')`);
      await tx.query(`insert into players (first_name, last_name, age_group, joined_on) select 'Child', n::text, 'U12', '2026-08-01' from generate_series(1, 10) n`);
      await tx.query(`insert into players (first_name, last_name, age_group, joined_on) values ('Solo', 'One', 'U15', '2026-08-01'), ('Solo', 'Two', 'U15', '2026-08-01')`);
      // Three finished U12/U15 sessions this season: 5, 7 and 0 U12s checked in; no U15 ever.
      for (const [day, n] of [["2026-09-04", 5], ["2026-09-11", 7], ["2026-09-18", 0]] as const) {
        const [{ id }] = await tx.query<{ id: string }>(
          `insert into sessions (title, starts_at, ends_at, venue, age_groups) values ('Training', $1::timestamptz, $1::timestamptz + interval '90 minutes', 'Hub', '{U12,U15}') returning id`,
          [`${day}T17:30:00Z`],
        );
        await tx.query(`insert into attendance (session_id, player_id) select $1, id from players where age_group = 'U12' order by last_name limit $2`, [id, n]);
      }
    });
    const admin = await t.signIn("owner@deensquad.test");
    const d = await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: null, withShop: false }));
    // 12 check-ins over the 2 sessions with the register taken, for 10 children: 60%.
    expect(d.attendance.season.find((g) => g.group === "U12")).toMatchObject({ squad: 10, held: 2, checkedIn: 12, averagePct: 60 });
    // Nobody from the U15s was ever checked in: no sessions held, no percentage (the page says "Register not used yet").
    expect(d.attendance.season.find((g) => g.group === "U15")).toMatchObject({ squad: 2, held: 0, checkedIn: 0, averagePct: null });
    expect(JSON.stringify(d)).not.toMatch(/NaN|Infinity/);
    // The chart leaves out the session nobody was checked in at, and the U15s (register never taken) at the other two.
    expect(d.attendance.sessions.map((s) => [s.pct, s.groups.map((g) => g.group)])).toEqual([
      [50, ["U12"]],
      [70, ["U12"]],
    ]);
  });

  it("reads sensibly for an empty club, with no division by zero", async () => {
    const t = await testDatabase();
    await t.asSystem((tx) => tx.query(`insert into staff (email, display_name, role) values ('owner@deensquad.test', 'Owner', 'admin')`));
    const admin = await t.signIn("owner@deensquad.test");
    const d = await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: null, withShop: true }));
    expect(d.players).toBe(0);
    expect(d.attendance.next.every((g) => g.session === null && g.squad === 0 && g.unanswered === 0)).toBe(true);
    expect(d.attendance.season.every((g) => g.held === 0 && g.averagePct === null)).toBe(true);
    expect(d.attendance.sessions).toEqual([]);
    expect(d.attendance.seasonPct).toBeNull();
    expect(d.families).toEqual({ parents: 0, signedIn: 0, invited: 0, notInvited: 0, todo: { contacts: 0, payment: 0, contract: 0, consent: 0 } });
    expect(d.shop).toEqual({ awaitingPayment: 0, toOrder: 0, ordered: 0, ready: 0, orders: 0, monthPence: 0, seasonPence: 0 });
    expect(d.news).toEqual({ recent: [], reminders: { app: 0, email: 0, sms: 0, whatsapp: 0, gate: 0 }, behind: 0 });
    expect(JSON.stringify(d)).not.toMatch(/NaN|Infinity/);
    expect(averagePct(0, 0)).toBeNull();
    expect(averagePct(3, 0)).toBeNull();
    expect(averagePct(3, 4)).toBe(75);
  });

  it("limits a U7 coach to the U7s", async () => {
    const { t } = await seeded(OCTOBER);
    await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U7}' where email = $1`, [DEV_EMAILS.coach]));
    const coach = await t.signIn(DEV_EMAILS.coach);
    const [kit] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from announcements where title like 'New away kit%'`));
    // A reminder to a U10-only parent must not show up in the U7 coach's numbers.
    const [u10Parent] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`select g.id from guardians g where g.email = 'parent1@example.com'`),
    );
    await t.asSystem((tx) =>
      tx.query(`insert into announcement_chases (announcement_id, guardian_id, channel, sent_at) values ($1, $2, 'email', $3)`, [
        kit.id,
        u10Parent.id,
        new Date(OCTOBER.getTime() - 3600000),
      ]),
    );

    const d = await t.asUser(coach, (tx) => loadDashboard(tx, { now: OCTOBER, limit: ["U7"], withShop: false }));
    expect(d.players).toBe(5);
    expect(d.attendance.next.map((g) => g.group)).toEqual(["U7"]);
    expect(d.attendance.season.map((g) => g.group)).toEqual(["U7"]);
    // Only the two Fridays Musa was checked in at count as held for the U7s.
    expect(d.attendance.season[0]).toMatchObject({ held: 2, checkedIn: 2 });
    // Only Musa's check-ins count on the chart, not Yusuf's: the two Fridays the U7 register was taken.
    expect(d.attendance.sessions.map((s) => [s.checkedIn, s.expected, s.groups.map((g) => g.group)])).toEqual([
      [1, 5, ["U7"]],
      [1, 5, ["U7"]],
    ]);
    expect(d.attendance.seasonPct).toBe(20);
    // Musa's two parents and the four other U7 parents.
    expect(d.families).toMatchObject({ parents: 6, notInvited: 6 });
    expect(d.families.todo).toEqual({ contacts: 5, payment: 5, contract: 5, consent: 5 });
    expect(d.payments).toEqual({ active: 0, self_reported: 0, missing: 5, overdue: 0 });
    expect(d.shop).toBeNull();
    // The U10 kit message isn't theirs; the club-wide ones count U7 parents only.
    expect(d.news.recent.map((n) => [n.title.slice(0, 12), n.read, n.total])).toEqual([
      ["Winter timin", 1, 6],
      ["Monthly plan", 1, 6],
    ]);
    expect(d.news.reminders.email).toBe(0);
    // Sara and the four other U7 parents haven't read either club-wide message.
    expect(d.news.behind).toBe(5);
  });
});

describe("Families search", () => {
  it("finds a child by their or a parent's name, treats % and _ literally and keeps a coach to their groups", async () => {
    const { t, admin } = await seeded(OCTOBER);
    const names = async (user: string, search: string, within?: ("U7" | "U10")[]) =>
      (await t.asUser(user, (tx) => loadFamilies(tx, null, within, { search }))).map((r) => r.firstName).sort();
    expect(await names(admin, "yusuf")).toEqual(["Yusuf"]);
    // Sara Sample is a parent of both children.
    expect(await names(admin, "Sara sam")).toEqual(["Musa", "Yusuf"]);
    expect(await names(admin, "%")).toEqual([]);
    expect(await names(admin, "_")).toEqual([]);
    expect(await names(admin, "Sara", ["U7"])).toEqual(["Musa"]);
  });
});
