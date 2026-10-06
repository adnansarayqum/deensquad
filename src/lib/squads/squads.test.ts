import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { loadDashboard } from "../admin/dashboard";
import { loadNewsDetail, loadNewsList } from "../admin/data";
import { runLadder, type ChaseTarget } from "../chase/ladder";
import { londonDate, londonTime } from "../dates";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import type { Queryable } from "../db/types";
import { loadFamily, loadNews, loadSquadCounts, loadUnreadCount, loadUpcomingSessions, saveAnswer } from "../parent/data";
import { buildWeek, squadInvites } from "../parent/views";
import { passToken } from "../pass/token";
import { notifyPending } from "../plans/notify";
import { checkInByPass } from "../staff/checkin";
import { loadRegister } from "../staff/register";
import { loadSquad, saveSquad } from "./squads";

// Tournament squads on the sample club. The "Spring Cup" is for U10 and U7, with only Yusuf (Adnan and
// Sara's U10) and Bilal (parent2's U10) picked. Ahmed (parent1's U10) and Musa (Adnan and Sara's U7) aren't.

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // Yusuf (picked) and Musa (not)
let sara: string; // the same two children
let ahmedsParent: string; // parent1: Ahmed, U10, not picked
let bilalsParent: string; // parent2: Bilal, U10, picked
let coach: string; // Coach Hamza, made a U7-only coach below
let admin: string;
let adminStaffId: string;
let ahmed: string;
let bilal: string;
let cup: string;

const playerOf = (email: string) =>
  t.asSystem(async (tx) => {
    const [r] = await tx.query<{ id: string }>(
      `select p.id from players p join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id where g.email = $1`,
      [email],
    );
    return r.id;
  });

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  ahmedsParent = await t.signIn("parent1@example.com");
  bilalsParent = await t.signIn("parent2@example.com");
  coach = await t.signIn(DEV_EMAILS.coach);
  admin = await t.signIn(DEV_EMAILS.admin);
  ahmed = await playerOf("parent1@example.com");
  bilal = await playerOf("parent2@example.com");
  [{ id: adminStaffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U7}' where email = $1`, [DEV_EMAILS.coach]));
  const start = new Date(Date.now() + 3 * 86400000);
  [{ id: cup }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('tournament', 'Spring Cup', $1, $2, 'Away ground', '{U7,U10}') returning id`,
      [start, new Date(start.getTime() + 3 * 3600000)],
    ),
  );
  // Ahmed's parent answered before the squad was picked; that answer goes when the squad is saved.
  await t.asSystem((tx) => tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'coming')`, [cup, ahmed]));
  const saved = await t.asUser(admin, (tx) => saveSquad(tx, cup, [DEV_IDS.yusuf, bilal], adminStaffId, null));
  expect(saved).toEqual({ ok: true, picked: 2, added: 2, removed: 0 });
});

const sees = (user: string, sql: string, params: unknown[]) => t.asUser(user, (tx) => tx.query(sql, params));

describe("who sees a squad session", () => {
  it("shows it only to families with a child picked", async () => {
    expect(await sees(adnan, `select 1 from sessions where id = $1`, [cup])).toHaveLength(1);
    expect(await sees(bilalsParent, `select 1 from sessions where id = $1`, [cup])).toHaveLength(1);
    expect(await sees(ahmedsParent, `select 1 from sessions where id = $1`, [cup])).toHaveLength(0);
    // Squad rows: a family sees only its own child's place, never who else is picked.
    expect(await sees(adnan, `select player_id from session_squads where session_id = $1`, [cup])).toEqual([{ player_id: DEV_IDS.yusuf }]);
    expect(await sees(ahmedsParent, `select 1 from session_squads where session_id = $1`, [cup])).toHaveLength(0);
  });

  it("lists it on the parent screens only for the picked child, and asks 'can they play'", async () => {
    const now = new Date();
    const ahmedFamily = (await t.asUser(ahmedsParent, loadFamily))!;
    const theirs = await t.asUser(ahmedsParent, (tx) => loadUpcomingSessions(tx, ahmedFamily.children, now));
    expect(theirs.map((s) => s.id)).not.toContain(cup);

    const family = (await t.asUser(adnan, loadFamily))!;
    const sessions = await t.asUser(adnan, (tx) => loadUpcomingSessions(tx, family.children, now));
    const found = sessions.find((s) => s.id === cup)!;
    expect(found.squad).toEqual([DEV_IDS.yusuf]);
    // Yusuf is asked about the cup once: as his next session, or as an invite beside it if Friday training comes first.
    // Musa (U7, not picked) isn't asked.
    const week = buildWeek(family.children, sessions, new Map(), new Map());
    const invites = squadInvites(week, sessions, new Map());
    const asked = [...week.filter((w) => w.session?.id === cup), ...invites.filter((i) => i.session.id === cup)].map((x) => x.child.firstName);
    expect(asked).toEqual(["Yusuf"]);
  });

  it("takes answers only for picked children, even from a parent of both", async () => {
    expect(await t.asUser(adnan, (tx) => saveAnswer(tx, cup, DEV_IDS.yusuf, "coming"))).toBe(true);
    expect(await t.asUser(adnan, (tx) => saveAnswer(tx, cup, DEV_IDS.musa, "coming"))).toBe(false);
    expect(await t.asUser(ahmedsParent, (tx) => saveAnswer(tx, cup, ahmed, "coming"))).toBe(false);
    // Row level security refuses a direct write too.
    await expect(sees(adnan, `insert into availability (session_id, player_id, answer) values ($1, $2, 'away')`, [cup, DEV_IDS.musa])).rejects.toThrow(
      /row-level security/,
    );
    const rows = await t.asSystem((tx) => tx.query<{ player_id: string }>(`select player_id from availability where session_id = $1 order by player_id`, [cup]));
    expect(rows.map((r) => r.player_id)).toEqual([DEV_IDS.yusuf]); // Ahmed's earlier answer went when the squad was picked
  });

  it("gives the squad's headcount to the squad only", async () => {
    expect(await t.asUser(sara, (tx) => loadSquadCounts(tx, cup, "U10"))).toEqual({ coming: 1, away: 0, squad: 2 });
    expect(await t.asUser(ahmedsParent, (tx) => loadSquadCounts(tx, cup, "U10"))).toEqual({ coming: 0, away: 0, squad: 0 });
    expect(await t.asUser(admin, (tx) => loadSquadCounts(tx, cup, "U7"))).toEqual({ coming: 0, away: 0, squad: 0 });
  });

  it("hides the session's plan from families outside the squad", async () => {
    await t.asSystem((tx) => tx.query(`insert into session_plans (session_id, age_group, body) values ($1, 'U10', 'Cup warm-up')`, [cup]));
    expect(await sees(adnan, `select 1 from session_plans where session_id = $1`, [cup])).toHaveLength(1);
    expect(await sees(ahmedsParent, `select 1 from session_plans where session_id = $1`, [cup])).toHaveLength(0);
    // And only the squad's parents are told about it.
    await t.asSystem((tx) => tx.query(`update session_plans set notified_at = now() where session_id <> $1`, [cup]));
    const told: string[] = [];
    const d = londonDate(new Date(Date.now() + 86400000));
    await t.asSystem((tx) =>
      notifyPending(tx, londonTime(d.year, d.month, d.day, 12, 0), async (_tx, users) => {
        told.push(...users);
      }),
    );
    expect(told.sort()).toEqual([adnan, sara, bilalsParent].sort());
  });
});

describe("messages to the squad", () => {
  let message: string;
  const posted = new Date("2030-06-03T11:00:00Z"); // a Monday, midday in London

  beforeAll(async () => {
    [{ id: message }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into announcements (topic, title, body, audience, requires_ack, posted_by, posted_at, squad_session_id)
         values ('Matches', 'Spring Cup: meet at 9', 'Bring water.', '{U7,U10}', true, $1, $2, $3) returning id`,
        [adminStaffId, posted, cup],
      ),
    );
  });

  it("reaches only the squad's families", async () => {
    expect(await sees(adnan, `select 1 from announcements where id = $1`, [message])).toHaveLength(1);
    expect(await sees(bilalsParent, `select 1 from announcements where id = $1`, [message])).toHaveLength(1);
    expect(await sees(ahmedsParent, `select 1 from announcements where id = $1`, [message])).toHaveLength(0);
    // The parent screens filter explicitly too (a parent who is also staff bypasses row level security).
    const ahmedFamily = (await t.asUser(ahmedsParent, loadFamily))!;
    expect((await t.asUser(ahmedsParent, (tx) => loadNews(tx, ahmedFamily))).map((n) => n.id)).not.toContain(message);
    const family = (await t.asUser(adnan, loadFamily))!;
    expect((await t.asUser(adnan, (tx) => loadNews(tx, family))).map((n) => n.id)).toContain(message);
    // Adnan's unread count includes it; marking it read takes it off again.
    const unread = await t.asUser(adnan, (tx) => loadUnreadCount(tx, family));
    await t.asUser(adnan, (tx) => tx.query(`insert into announcement_reads (announcement_id, guardian_id) values ($1, my_guardian_id())`, [message]));
    expect(await t.asUser(adnan, (tx) => loadUnreadCount(tx, family))).toBe(unread - 1);
    await t.asSystem((tx) => tx.query(`delete from announcement_reads where announcement_id = $1`, [message]));
    await expect(sees(ahmedsParent, `insert into announcement_reads (announcement_id, guardian_id) values ($1, my_guardian_id())`, [message])).rejects.toThrow(
      /row-level security/,
    );
  });

  it("counts and lists only the squad's parents for the club", async () => {
    const detail = (await t.asUser(admin, (tx) => loadNewsDetail(tx, message)))!;
    expect(detail.news.audienceCount).toBe(3); // Adnan, Sara, Bilal's parent
    expect(detail.news.squad).toEqual({ sessionId: cup, title: "Spring Cup" });
    expect(detail.unread.map((u) => u.id).sort()).toEqual(
      [DEV_IDS.adnan, DEV_IDS.sara, (await t.asSystem((tx) => tx.query<{ id: string }>(`select id from guardians where email = 'parent2@example.com'`)))[0].id].sort(),
    );
    const list = await t.asUser(admin, (tx) => loadNewsList(tx));
    expect(list.find((n) => n.id === message)?.audienceCount).toBe(3);
  });

  it("chases only the squad's parents, and skips a parent whose child's other parent has read it", async () => {
    const sent: ChaseTarget[] = [];
    const record = async (targets: ChaseTarget[]) => {
      sent.push(...targets);
      return targets;
    };
    const senders = { pushUsers: async () => new Set<string>(), email: record };
    await t.asUser(sara, (tx) => tx.query(`insert into announcement_reads (announcement_id, guardian_id) values ($1, my_guardian_id())`, [message]));
    const result = await t.asSystem((tx: Queryable) => runLadder(tx, new Date(posted.getTime() + 25 * 3600000), senders, message));
    expect(result.email).toBe(1);
    const [bilalsGuardian] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from guardians where email = 'parent2@example.com'`));
    expect(sent.map((s) => [s.guardianId, s.children])).toEqual([[bilalsGuardian.id, ["Bilal"]]]);
  });
});

describe("picking the squad", () => {
  it("lets a coach pick only for sessions within their groups", async () => {
    const [coachStaff] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.coach]));
    // Coach Hamza runs U7 only; the cup is U7 and U10, so it stays with admins.
    expect(await t.asUser(coach, (tx) => saveSquad(tx, cup, [DEV_IDS.musa], coachStaff.id, ["U7"]))).toEqual({ ok: false, reason: "not_yours" });
    expect(await t.asUser(coach, (tx) => loadSquad(tx, cup, ["U7"]))).toBeNull();
    const [u7] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('match', 'U7 friendly', now() + interval '4 days', now() + interval '4 days 2 hours', 'Home', '{U7}') returning id`,
      ),
    );
    // Children outside the session's groups are ignored.
    expect(await t.asUser(coach, (tx) => saveSquad(tx, u7.id, [DEV_IDS.musa, DEV_IDS.yusuf], coachStaff.id, ["U7"]))).toEqual({
      ok: true,
      picked: 1,
      added: 1,
      removed: 0,
    });
    const view = (await t.asUser(coach, (tx) => loadSquad(tx, u7.id, ["U7"])))!;
    expect(view.picked).toBe(1);
    expect(view.children.filter((c) => c.picked).map((c) => c.firstName)).toEqual(["Musa"]);
  });

  it("shows the admin who confirmed, and taking a child out hides the session and clears their answer", async () => {
    const view = (await t.asUser(admin, (tx) => loadSquad(tx, cup, null)))!;
    expect(view.children).toHaveLength(15 + 1 + 4 + 1); // every U10 (sample squad and Yusuf) and U7 (sample and Musa)
    expect(view.children.filter((c) => c.picked).map((c) => [c.firstName, c.answer])).toEqual([
      ["Bilal", null],
      ["Yusuf", "coming"],
    ]);
    expect(await t.asUser(admin, (tx) => saveSquad(tx, cup, [bilal], adminStaffId, null))).toMatchObject({ ok: true, picked: 1, removed: 1 });
    expect(await sees(adnan, `select 1 from sessions where id = $1`, [cup])).toHaveLength(0);
    expect(await t.asSystem((tx) => tx.query(`select 1 from availability where session_id = $1 and player_id = $2`, [cup, DEV_IDS.yusuf]))).toHaveLength(0);
    // Back in: asked again.
    await t.asUser(admin, (tx) => saveSquad(tx, cup, [bilal, DEV_IDS.yusuf], adminStaffId, null));
    expect(await sees(adnan, `select 1 from sessions where id = $1`, [cup])).toHaveLength(1);
  });

  it("shows each child's attendance this season, counting only sessions where their group's register was taken", async () => {
    const view = (await t.asUser(admin, (tx) => loadSquad(tx, cup, null)))!;
    const of = (name: string) => view.children.find((c) => c.firstName === name)!.season;
    // Yusuf came to every U10 session with a register (five of the last six Fridays); Bilal to none of them.
    expect(of("Yusuf").held).toBeGreaterThan(0);
    expect(of("Yusuf").held).toBeLessThanOrEqual(5);
    expect(of("Yusuf").attended).toBe(of("Yusuf").held);
    expect(of("Bilal")).toEqual({ attended: 0, held: of("Yusuf").held });
    // Musa's U7 register was taken only when he came.
    expect(of("Musa").attended).toBe(of("Musa").held);
    expect(of("Musa").held).toBeLessThanOrEqual(2);
  });

  it("lists only the squad on the register", async () => {
    const now = new Date();
    const view = (await t.asUser(admin, (tx) => loadRegister(tx, { now, sessionId: cup, group: "U10" })))!;
    expect(view.session.id).toBe(cup);
    expect(view.rows.map((r) => r.firstName).sort()).toEqual(["Bilal", "Yusuf"]);
    // No U7 is picked, so the register has no U7 tab.
    expect(view.groups).toEqual(["U10"]);
  });
});

describe("the gate on a squad day", () => {
  it("checks a child into the squad session only if they're picked", async () => {
    // A Saturday with the squad's tournament in the morning and ordinary U10 training at the same time.
    const at = (h: number) => new Date(Date.UTC(2030, 5, 8, h - 1)); // London is UTC+1 in June
    const [squadDay] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (id, kind, title, starts_at, ends_at, venue, age_groups) values
           ('00000000-0000-4000-8000-0000000000a1', 'tournament', 'Summer Cup', $1, $2, 'Away', '{U10}') returning id`,
        [at(9), at(13)],
      ),
    );
    await t.asSystem((tx) =>
      tx.query(
        `insert into sessions (id, kind, title, starts_at, ends_at, venue, age_groups) values
           ('00000000-0000-4000-8000-0000000000b2', 'training', 'Training', $1, $2, 'Home', '{U10}')`,
        [at(9), at(13)],
      ),
    );
    await t.asUser(admin, (tx) => saveSquad(tx, squadDay.id, [bilal], adminStaffId, null));
    // The squad session has the lower id and the same start, so without squads it would win for everyone.
    const yusuf = await t.asUser(admin, (tx) => checkInByPass(tx, passToken(DEV_IDS.yusuf), at(10)));
    const bilals = await t.asUser(admin, (tx) => checkInByPass(tx, passToken(bilal), at(10)));
    expect(yusuf).toMatchObject({ ok: true, child: { status: "checked_in", session: { title: "Training" } } });
    expect(bilals).toMatchObject({ ok: true, child: { status: "checked_in", session: { title: "Summer Cup" } } });
  });
});

describe("the admin overview on a squad session", () => {
  it("counts the squad, not the whole group, for the next session", async () => {
    const monday = new Date("2026-10-05T09:00:00Z");
    const d = await testDatabase({ seed: true, now: monday });
    const adminUser = await d.signIn(DEV_EMAILS.admin);
    const [{ id }] = await d.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('tournament', 'Tuesday Cup', '2026-10-06T09:00:00Z', '2026-10-06T12:00:00Z', 'Away', '{U10,U12}') returning id`,
      ),
    );
    const [staff] = await d.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
    const picks = await d.asSystem((tx) => tx.query<{ id: string }>(`select id from players where age_group = 'U10' order by first_name limit 3`));
    await d.asUser(adminUser, (tx) => saveSquad(tx, id, picks.map((p) => p.id), staff.id, null));
    await d.asSystem((tx) =>
      tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'coming'), ($1, $3, 'away')`, [id, picks[0].id, picks[1].id]),
    );
    const dash = await d.asUser(adminUser, (tx) => loadDashboard(tx, { now: monday, limit: null, withShop: false }));
    const u10 = dash.attendance.next.find((n) => n.group === "U10")!;
    expect(u10).toMatchObject({ squad: 3, coming: 1, away: 1, unanswered: 1, session: { title: "Tuesday Cup" } });
    // Nobody from U12 is picked, so their next session is still Friday's training.
    expect(dash.attendance.next.find((n) => n.group === "U12")!.session?.title).toBe("Training");
  });
});
