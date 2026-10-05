import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import type { CurrentUser } from "../auth/session";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";

// The Server Actions behind the Squad page, run against a test database as a given member of staff.
const holder: { t?: Awaited<ReturnType<typeof testDatabase>>; user?: CurrentUser & { staff: NonNullable<CurrentUser["staff"]> } } = {};
vi.mock("../db", () => ({ asUser: <T>(id: string, fn: (tx: Queryable) => Promise<T>) => holder.t!.asUser(id, fn) }));
vi.mock("../auth/session", async (importActual) => ({
  ...(await importActual<typeof import("../auth/session")>()),
  requireStaff: async () => holder.user!,
  requireAdmin: async () => holder.user!,
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("../chase/run", () => ({ runChase: async () => ({}) }));

const { postNews } = await import("../admin/actions");
const { loadNewsList } = await import("../admin/data");
const { saveSquad } = await import("./squads");

let t: Awaited<ReturnType<typeof testDatabase>>;
let coachUser: string;
let adminUser: string;
let coachStaff: string;
let adminStaff: string;

const as = (userId: string, staffId: string, role: "admin" | "coach", ageGroups: ("U10" | "U12")[]) => {
  holder.user = { id: userId, email: "x@example.com", guardian: null, staff: { id: staffId, role, displayName: "Staff", ageGroups } };
};

async function addSession(groups: string): Promise<string> {
  const [s] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('tournament', 'Cup', now() + interval '5 days', now() + interval '5 days 3 hours', 'Away', $1::age_group[]) returning id`,
      [groups],
    ),
  );
  // Picked by an admin: Yusuf (U10). A session without U10 gets nobody this way.
  await t.asUser(adminUser, (tx) => saveSquad(tx, s.id, [DEV_IDS.yusuf], adminStaff, null));
  return s.id;
}

function form(squadSession: string): FormData {
  const f = new FormData();
  f.set("topic", "Matches");
  f.set("title", "Meet at 9");
  f.set("body", "Bring water.");
  f.set("requiresAck", "on");
  f.set("squadSession", squadSession);
  return f;
}

const messagesFor = (session: string) =>
  t.asSystem((tx) => tx.query<{ id: string }>(`select id from announcements where squad_session_id = $1`, [session]));

beforeAll(async () => {
  t = holder.t = await testDatabase({ seed: true });
  coachUser = await t.signIn(DEV_EMAILS.coach);
  adminUser = await t.signIn(DEV_EMAILS.admin);
  const staff = await t.asSystem((tx) => tx.query<{ id: string; email: string }>(`select id, email from staff`));
  coachStaff = staff.find((s) => s.email === DEV_EMAILS.coach)!.id;
  adminStaff = staff.find((s) => s.email === DEV_EMAILS.admin)!.id;
  await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U10}' where id = $1`, [coachStaff]));
});

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

describe("messaging a squad", () => {
  it("refuses a U10 coach for a joint U10 and U12 session, or a U12 one, and posts nothing", async () => {
    const joint = await addSession("{U10,U12}");
    const u12 = await addSession("{U12}");
    await t.asSystem((tx) => tx.query(`insert into session_squads (session_id, player_id) select $1, id from players where age_group = 'U10' limit 1`, [u12]));
    as(coachUser, coachStaff, "coach", ["U10"]);
    expect(await postNews({}, form(joint))).toEqual({ error: "Only an admin can message this squad." });
    expect(await postNews({}, form(u12))).toEqual({ error: "Only an admin can message this squad." });
    expect(await messagesFor(joint)).toHaveLength(0);
    expect(await messagesFor(u12)).toHaveLength(0);

    // An admin can message the joint session's squad.
    as(adminUser, adminStaff, "admin", []);
    await expect(postNews({}, form(joint))).rejects.toThrow(/^redirect \/admin\/news\/[0-9a-f-]{36}\?posted=1$/);
    expect(await messagesFor(joint)).toHaveLength(1);
  });

  it("lets the U10 coach message the squad of a U10-only session", async () => {
    const u10 = await addSession("{U10}");
    as(coachUser, coachStaff, "coach", ["U10"]);
    await expect(postNews({}, form(u10))).rejects.toThrow(/^redirect \/admin\/news\//);
    const [row] = await t.asSystem((tx) =>
      tx.query<{ audience: string[]; posted_by: string }>(
        `select audience::text[] as audience, posted_by from announcements where squad_session_id = $1`,
        [u10],
      ),
    );
    expect(row).toEqual({ audience: ["U10"], posted_by: coachStaff });
  });
});

describe("read receipts on a squad message", () => {
  it("count only parents the message still reaches once the squad changes", async () => {
    const before = await t.asUser(adminUser, (tx) => loadNewsList(tx));
    const cup = await addSession("{U10}");
    // Ahmed (parent1's child) instead of Yusuf, after Adnan has read it.
    const [{ id: ahmed }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `select p.id from players p join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id where g.email = 'parent1@example.com'`,
      ),
    );
    as(adminUser, adminStaff, "admin", []);
    await expect(postNews({}, form(cup))).rejects.toThrow(/^redirect/);
    const [{ id: message }] = await messagesFor(cup);
    const adnan = await t.signIn(DEV_EMAILS.parent);
    await t.asUser(adnan, (tx) => tx.query(`insert into announcement_reads (announcement_id, guardian_id) values ($1, my_guardian_id())`, [message]));
    const read = (await t.asUser(adminUser, (tx) => loadNewsList(tx))).find((n) => n.id === message)!;
    expect([read.readCount, read.audienceCount]).toEqual([1, 2]); // Adnan read it; Sara hasn't

    await t.asUser(adminUser, (tx) => saveSquad(tx, cup, [ahmed], adminStaff, null));
    const after = (await t.asUser(adminUser, (tx) => loadNewsList(tx))).find((n) => n.id === message)!;
    expect([after.readCount, after.audienceCount]).toEqual([0, 1]);

    // Messages to groups or everyone count as before.
    const groupNews = (await t.asUser(adminUser, (tx) => loadNewsList(tx))).filter((n) => !n.squad);
    expect(groupNews.map((n) => [n.title, n.readCount, n.audienceCount])).toEqual(before.filter((n) => !n.squad).map((n) => [n.title, n.readCount, n.audienceCount]));
    expect(groupNews.find((n) => n.title.startsWith("Winter"))).toMatchObject({ readCount: 1 });
    expect(groupNews.find((n) => n.title.startsWith("New away kit"))).toMatchObject({ readCount: 0, audienceCount: 17 });
  });
});
