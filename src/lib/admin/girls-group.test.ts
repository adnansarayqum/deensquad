import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { coachLimit, isGroupCoach, staffGroups } from "../auth/session";
import { DEV_EMAILS } from "../db/dev-seed";
import { loadFamily, loadNews, loadUpcomingSessions } from "../parent/data";
import { loadSquad, saveSquad } from "../squads/squads";
import { loadRegister, summarise } from "../staff/register";
import { loadFamilies, loadNewsList } from "./data";
import { addSessionRun } from "./sessions";
import { within } from "./scope";

// The Girls group (migration 0018) works like any other group: Maryam, a girl in Girls, on the sample club.
// The club's Friday training (every age group, 6:30pm) is today; a Girls session runs at 5pm the same day.
const friday = new Date("2026-10-09T15:00:00Z");
const atGate = new Date("2026-10-09T16:05:00Z");

let t: Awaited<ReturnType<typeof testDatabase>>;
let hina: string; // Maryam's mother
let adnan: string; // Yusuf (U10) and Musa (U7): no girls
let coach: string; // Coach Hamza, made a Girls-only coach below
let coachStaffId: string;
let maryam: string;
let girlsSession: string;

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: friday });
  [{ id: maryam }] = await t.asSystem(async (tx) => {
    const [{ id: guardian }] = await tx.query<{ id: string }>(
      `insert into guardians (first_name, last_name, email) values ('Hina', 'Ali', 'hina@example.com') returning id`,
    );
    const rows = await tx.query<{ id: string }>(
      `insert into players (first_name, last_name, date_of_birth, age_group) values ('Maryam', 'Ali', '2016-05-01', 'Girls') returning id`,
    );
    await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [rows[0].id, guardian]);
    [{ id: coachStaffId }] = await tx.query<{ id: string }>(
      `update staff set age_groups = '{Girls}' where lower(email) = lower($1) returning id`,
      [DEV_EMAILS.coach],
    );
    return rows;
  });
  hina = await t.signIn("hina@example.com");
  adnan = await t.signIn(DEV_EMAILS.parent);
  coach = await t.signIn(DEV_EMAILS.coach);
  await t.asUser(coach, (tx) =>
    addSessionRun(tx, {
      kind: "training",
      title: "Girls training",
      venue: "Bobby Moore Sports Hub",
      groups: ["Girls"],
      times: [{ start: new Date("2026-10-09T16:00:00Z"), end: new Date("2026-10-09T17:00:00Z") }],
      arriveBy: null,
      kit: null,
      prayerNote: null,
      notes: null,
    }),
  );
  [{ id: girlsSession }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where title = 'Girls training'`));
});

describe("the Girls group", () => {
  it("holds a child, who sees Girls sessions and not the age groups' ones", async () => {
    const { family, upcoming } = await t.asUser(hina, async (tx) => {
      const family = (await loadFamily(tx))!;
      return { family, upcoming: await loadUpcomingSessions(tx, family.children, friday) };
    });
    expect(family.children.map((c) => [c.firstName, c.ageGroup])).toEqual([["Maryam", "Girls"]]);
    expect(upcoming[0]).toMatchObject({ id: girlsSession, ageGroups: ["Girls"] });
    expect(upcoming.every((s) => s.ageGroups.includes("Girls"))).toBe(true);

    const adnans = await t.asUser(adnan, async (tx) => loadUpcomingSessions(tx, (await loadFamily(tx))!.children, friday));
    expect(adnans.map((s) => s.id)).not.toContain(girlsSession);
  });

  it("has its own register, listing her and no one else", async () => {
    const view = (await t.asUser(coach, (tx) => loadRegister(tx, { now: atGate, group: "Girls", allowed: ["Girls"] })))!;
    expect(view.session.id).toBe(girlsSession);
    expect(view.groups).toEqual(["Girls"]);
    expect(view.rows.map((r) => [r.firstName, r.ageGroup])).toEqual([["Maryam", "Girls"]]);
    expect(summarise(view).notHere.map((r) => r.firstName)).toEqual(["Maryam"]);
  });

  it("limits a Girls coach to Girls families, and lets them post news to Girls only", async () => {
    const staff = { role: "coach" as const, ageGroups: ["Girls" as const] };
    expect(staffGroups(staff)).toEqual(["Girls"]);
    expect(isGroupCoach(staff)).toBe(true);
    expect(within(["Girls"], staffGroups(staff))).toBe(true);
    expect(within(["U10"], staffGroups(staff))).toBe(false);

    const families = await t.asUser(coach, (tx) => loadFamilies(tx, null, coachLimit(staff)!));
    expect(families.map((f) => [f.firstName, f.ageGroup])).toEqual([["Maryam", "Girls"]]);

    const [{ id: news }] = await t.asUser(coach, (tx) =>
      tx.query<{ id: string }>(
        `insert into announcements (topic, title, body, audience, requires_ack, posted_by) values ('Club', 'Girls kit', 'Pink socks on Friday.', '{Girls}', true, $1) returning id`,
        [coachStaffId],
      ),
    );
    const coachList = await t.asUser(coach, (tx) => loadNewsList(tx, 50, ["Girls"]));
    expect(coachList.find((n) => n.id === news)).toMatchObject({ audienceCount: 1, readCount: 0 });

    const hinas = await t.asUser(hina, async (tx) => loadNews(tx, (await loadFamily(tx))!));
    expect(hinas.map((n) => n.id)).toContain(news);
    const adnans = await t.asUser(adnan, async (tx) => loadNews(tx, (await loadFamily(tx))!));
    expect(adnans.map((n) => n.id)).not.toContain(news);
  });

  it("picks a squad for a Girls session, which a coach of another group can't", async () => {
    const [{ id: cup }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('tournament', 'Girls Cup', '2026-10-24T09:00:00Z', '2026-10-24T13:00:00Z', 'Venue to be confirmed', '{Girls}') returning id`,
      ),
    );
    expect(await t.asUser(coach, (tx) => saveSquad(tx, cup, [maryam], coachStaffId, ["U7"]))).toEqual({ ok: false, reason: "not_yours" });
    expect(await t.asUser(coach, (tx) => saveSquad(tx, cup, [maryam], coachStaffId, ["Girls"]))).toMatchObject({ ok: true, picked: 1 });

    const squad = (await t.asUser(coach, (tx) => loadSquad(tx, cup, ["Girls"], friday)))!;
    expect(squad.children.map((c) => [c.firstName, c.picked])).toEqual([["Maryam", true]]);
    const upcoming = await t.asUser(hina, async (tx) => loadUpcomingSessions(tx, (await loadFamily(tx))!.children, friday));
    expect(upcoming.find((s) => s.id === cup)?.squad).toEqual([maryam]);
  });
});
