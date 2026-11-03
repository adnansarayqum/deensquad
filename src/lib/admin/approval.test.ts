// Children a parent adds wait for an admin's approval before their family sees the group (migration 0047; the
// security review, 3 Nov 2026). Run as different signed-in people on PGlite with the sample club.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { applyRegistration } from "../auth/registration";
import { addMyChild } from "../parent/profile";
import { approve } from "./approval";
import { NEEDS } from "./needs";

let t: Awaited<ReturnType<typeof testDatabase>>;
let stranger: string;
let strangerChild: string;
let adminStaff: string;
let adminUser: string;
const ids: Record<string, string> = {};

const visible = (user: string) =>
  t.asUser(user, async (tx) => ({
    news: (await tx.query<{ id: string }>(`select id from announcements where id = any ($1::uuid[])`, [[ids.u7News, ids.clubNews]])).map((r) => r.id).sort(),
    sessions: (await tx.query<{ id: string }>(`select id from sessions where id = $1`, [ids.u7Session])).length,
    sheets: (await tx.query<{ id: string }>(`select id from practice_sheets where id = $1`, [ids.everySheet])).length,
  }));

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  await t.asSystem(async (tx) => {
    const [{ id: staff }] = await tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]);
    adminStaff = staff;
    const one = async (sql: string, params: unknown[] = []) => (await tx.query<{ id: string }>(sql, params))[0].id;
    ids.u7News = await one(`insert into announcements (topic, title, body, audience, posted_by) values ('Kit', 'U7 kit', 'x', '{U7}', $1) returning id`, [staff]);
    ids.clubNews = await one(`insert into announcements (topic, title, body, posted_by) values ('Timing', 'Club news', 'x', $1) returning id`, [staff]);
    ids.u7Session = await one(
      `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('training', 'Training', now() + interval '2 days', now() + interval '2 days 90 minutes', 'Hub', '{U7}') returning id`,
    );
    ids.everySheet = await one(`insert into practice_sheets (title, body) values ('Juggling', 'x') returning id`);
    // A stranger signs themselves up with a "U7" child, as /sign-up does once the emailed code is used.
    const reg = await applyRegistration(tx, "stranger@example.com", {
      firstName: "Sam",
      lastName: "Stranger",
      phone: null,
      children: [{ firstName: "Tom", lastName: "Stranger", dateOfBirth: "2019-05-05", ageGroup: "U7" }],
    });
    [{ id: strangerChild }] = await tx.query<{ id: string }>(`select player_id as id from player_guardians where guardian_id = $1`, [reg.guardianId]);
  });
  stranger = await t.signIn("stranger@example.com");
  adminUser = await t.signIn(DEV_EMAILS.admin);
});

describe("approving children a parent added", () => {
  it("a self-signed-up family sees no group or club-wide news, sessions or every-group sheets until approved", async () => {
    expect(await visible(stranger)).toEqual({ news: [], sessions: 0, sheets: 0 });
    // Admins see the child waiting.
    const waiting = await t.asUser(adminUser, (tx) => tx.query<{ id: string }>(`select p.id from players p where ${NEEDS.approve.where}`));
    expect(waiting.map((w) => w.id)).toEqual([strangerChild]);

    expect(await t.asUser(adminUser, (tx) => approve(tx, strangerChild, adminStaff))).toBe(true);
    expect(await t.asUser(adminUser, (tx) => approve(tx, strangerChild, adminStaff))).toBe(false);
    expect(await visible(stranger)).toEqual({ news: [ids.u7News, ids.clubNews].sort(), sessions: 1, sheets: 1 });
  });

  it("the club's own families are approved, and a child a parent adds waits, without widening the family's groups", async () => {
    const adnan = await t.signIn(DEV_EMAILS.parent);
    // Adnan's sample children (U10 and U7) came from the club: approved, so he reads the U7 news already.
    expect((await visible(adnan)).news).toContain(ids.u7News);
    const girl = await t.asUser(adnan, (tx) => addMyChild(tx, { firstName: "Maryam", lastName: "Sarayqum", dateOfBirth: "2018-03-03", ageGroup: "Girls" }));
    const [row] = await t.asSystem((tx) => tx.query<{ approved: boolean }>(`select approved_at is not null as approved from players where id = $1`, [girl]));
    expect(row.approved).toBe(false);
    const groups = await t.asUser(adnan, (tx) => tx.query<{ g: string[] }>(`select my_age_groups()::text[] as g`));
    expect(groups[0].g.sort()).toEqual(["U10", "U7"]);
    // Sample children Adnan already had stay approved.
    const [yusuf] = await t.asSystem((tx) => tx.query<{ approved: boolean }>(`select approved_at is not null as approved from players where id = $1`, [DEV_IDS.yusuf]));
    expect(yusuf.approved).toBe(true);
  });

  it("a parent can't approve their own child", async () => {
    const [{ id: waiting }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where approved_at is null limit 1`));
    await t.asUser(stranger, (tx) => tx.query(`update players set approved_at = now() where id = $1`, [waiting])).catch(() => undefined);
    const [row] = await t.asSystem((tx) => tx.query<{ approved: boolean }>(`select approved_at is not null as approved from players where id = $1`, [waiting]));
    expect(row.approved).toBe(false);
  });
});
