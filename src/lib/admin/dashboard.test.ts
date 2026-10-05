import { describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { averagePct, loadDashboard, monthStart } from "./dashboard";
import { loadFamilies } from "./data";
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
    expect(d.attendance.next.map((g) => g.group)).toEqual(["U6", "U7", "U10", "U12", "U15"]);
    // Season: six Fridays held. Yusuf came to five (of 6 × 16 U10 places), Musa to two (of 6 × 5).
    expect(d.attendance.season.find((g) => g.group === "U10")).toMatchObject({ held: 6, checkedIn: 5, averagePct: 5 });
    expect(d.attendance.season.find((g) => g.group === "U7")).toMatchObject({ held: 6, checkedIn: 2, averagePct: 7 });
    expect(d.attendance.season.find((g) => g.group === "U12")).toMatchObject({ squad: 0, averagePct: null });
    expect(d.attendance.recent.map((s) => s.checkedIn)).toEqual([1, 0, 1, 1, 2, 2]);

    expect(d.families).toMatchObject({ parents: 21, signedIn: 0, invited: 0, notInvited: 21 });
    // Only Yusuf has a contact, a photo answer and an active plan; nobody has signed the contract yet.
    expect(d.families.todo).toEqual({ contacts: 20, payment: 20, contract: 21, consent: 20 });
    expect(d.payments).toEqual({ active: 1, self_reported: 0, missing: 20, overdue: 0 });

    expect(d.shop).toEqual({ awaitingPayment: 1, toOrder: 1, ready: 1, monthPence: 3500, seasonPence: 4200 });

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

  it("starts the season on 1 August", async () => {
    const { t, admin } = await seeded(AUGUST);
    const d = await t.asUser(admin, (tx) => loadDashboard(tx, { now: AUGUST, limit: null, withShop: false }));
    // 7 and 14 August only. Yusuf and Musa both came to those two.
    expect(d.attendance.season.find((g) => g.group === "U10")).toMatchObject({ held: 2, checkedIn: 2, averagePct: 6 });
    expect(d.attendance.season.find((g) => g.group === "U7")).toMatchObject({ held: 2, checkedIn: 2, averagePct: 20 });
    // The chart of recent sessions isn't limited to the season.
    expect(d.attendance.recent).toHaveLength(6);
    expect(d.shop).toBeNull();
    expect(monthStart(AUGUST).toISOString()).toBe("2026-07-31T23:00:00.000Z");
  });

  it("reads sensibly for an empty club, with no division by zero", async () => {
    const t = await testDatabase();
    await t.asSystem((tx) => tx.query(`insert into staff (email, display_name, role) values ('owner@deensquad.test', 'Owner', 'admin')`));
    const admin = await t.signIn("owner@deensquad.test");
    const d = await t.asUser(admin, (tx) => loadDashboard(tx, { now: OCTOBER, limit: null, withShop: true }));
    expect(d.players).toBe(0);
    expect(d.attendance.next.every((g) => g.session === null && g.squad === 0 && g.unanswered === 0)).toBe(true);
    expect(d.attendance.season.every((g) => g.held === 0 && g.averagePct === null)).toBe(true);
    expect(d.attendance.recent).toEqual([]);
    expect(d.families).toEqual({ parents: 0, signedIn: 0, invited: 0, notInvited: 0, todo: { contacts: 0, payment: 0, contract: 0, consent: 0 } });
    expect(d.shop).toEqual({ awaitingPayment: 0, toOrder: 0, ready: 0, monthPence: 0, seasonPence: 0 });
    expect(d.news).toEqual({ recent: [], reminders: { app: 0, email: 0, sms: 0, whatsapp: 0, gate: 0 }, behind: 0 });
    expect(JSON.stringify(d)).not.toMatch(/NaN|Infinity/);
    expect(averagePct(0, 0, 0)).toBeNull();
    expect(averagePct(3, 2, 0)).toBeNull();
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
    expect(d.attendance.season[0]).toMatchObject({ held: 6, checkedIn: 2 });
    // Only Musa's check-ins count on the recent chart, not Yusuf's.
    expect(d.attendance.recent.map((s) => s.checkedIn)).toEqual([0, 0, 0, 0, 1, 1]);
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
