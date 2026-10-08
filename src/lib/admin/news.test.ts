import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { runLadder, type ChaseTarget } from "../chase/ladder";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import type { Queryable } from "../db/types";
import { loadFamily, loadNews, loadUnreadCount } from "../parent/data";
import { audienceLabel, loadNewsDetail, loadNewsList } from "./data";
import { CHOSEN_MAX } from "./news-audience";
import { checkChosenChildren, insertNews, loadNewsChildren } from "./news";

// News to chosen children on the sample club: a message about Musa (U7, Adnan and Sara's younger child) reaches
// only Adnan and Sara. Nuh is another U7 (parent16); his parent must not see it, even by id.

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string;
let sara: string;
let nuhsParent: string; // parent16: Nuh, U7, not chosen
let isasParent: string; // parent17: Isa, U7, made a coach below (a parent who is also staff)
let coach: string; // U7-only coach
let admin: string;
let adminStaffId: string;
let message: string;
const posted = new Date("2030-06-03T11:00:00Z"); // a Monday, midday in London

const guardianId = async (email: string) => (await t.asSystem((tx) => tx.query<{ id: string }>(`select id from guardians where email = $1`, [email])))[0].id;
const sees = (user: string, sql: string, params: unknown[]) => t.asUser(user, (tx) => tx.query(sql, params));

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  nuhsParent = await t.signIn("parent16@example.com");
  await t.asSystem((tx) => tx.query(`insert into staff (email, display_name, role, age_groups) values ('parent17@example.com', 'Coach Isa', 'coach', '{U10}')`));
  isasParent = await t.signIn("parent17@example.com");
  coach = await t.signIn(DEV_EMAILS.coach);
  admin = await t.signIn(DEV_EMAILS.admin);
  await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U7}' where email = $1`, [DEV_EMAILS.coach]));
  [{ id: adminStaffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  message = await t.asUser(admin, async (tx) => {
    const checked = await checkChosenChildren(tx, [DEV_IDS.musa], null);
    if ("error" in checked) throw new Error(checked.error);
    expect(checked.groups).toEqual(["U7"]);
    return insertNews(tx, { topic: "Matches", title: "Musa picked for the cup", body: "Well done.", audience: checked.groups, requiresAck: true, postedBy: adminStaffId, squadSession: null, children: [DEV_IDS.musa] });
  });
  await t.asSystem((tx) => tx.query(`update announcements set posted_at = $2 where id = $1`, [message, posted]));
});

describe("a message to chosen children", () => {
  it("is stored with its children and their group as the audience", async () => {
    const [row] = await t.asSystem((tx) =>
      tx.query<{ audience: string[]; to_children: boolean; n: number }>(
        `select audience::text[] as audience, to_children, (select count(*)::int from announcement_players where announcement_id = a.id) as n from announcements a where id = $1`,
        [message],
      ),
    );
    expect(row).toEqual({ audience: ["U7"], to_children: true, n: 1 });
  });

  it("can be read only by the chosen children's parents, even by id", async () => {
    expect(await sees(adnan, `select 1 from announcements where id = $1`, [message])).toHaveLength(1);
    expect(await sees(sara, `select 1 from announcements where id = $1`, [message])).toHaveLength(1);
    // Nuh is in U7 too, but wasn't chosen.
    expect(await sees(nuhsParent, `select 1 from announcements where id = $1`, [message])).toHaveLength(0);
    // A family sees only its own children's places, never who else a message was for.
    expect(await sees(adnan, `select player_id from announcement_players where announcement_id = $1`, [message])).toEqual([{ player_id: DEV_IDS.musa }]);
    expect(await sees(nuhsParent, `select 1 from announcement_players where announcement_id = $1`, [message])).toHaveLength(0);
    await expect(sees(nuhsParent, `insert into announcement_reads (announcement_id, guardian_id) values ($1, my_guardian_id())`, [message])).rejects.toThrow(
      /row-level security/,
    );
    await expect(sees(nuhsParent, `insert into announcement_players (announcement_id, player_id) values ($1, $2)`, [message, DEV_IDS.yusuf])).rejects.toThrow(
      /row-level security/,
    );
  });

  it("shows in News only for the chosen child's family, a staff parent included", async () => {
    const family = (await t.asUser(adnan, loadFamily))!;
    const news = await t.asUser(adnan, (tx) => loadNews(tx, family));
    expect(news.map((n) => n.id)).toContain(message);
    expect(await t.asUser(adnan, (tx) => loadUnreadCount(tx, family))).toBeGreaterThan(0);
    const nuhFamily = (await t.asUser(nuhsParent, loadFamily))!;
    expect((await t.asUser(nuhsParent, (tx) => loadNews(tx, nuhFamily))).map((n) => n.id)).not.toContain(message);
    // Isa's parent is also staff, so row level security lets them read every message; their News still filters to their family.
    expect(await sees(isasParent, `select 1 from announcements where id = $1`, [message])).toHaveLength(1);
    const isaFamily = (await t.asUser(isasParent, loadFamily))!;
    expect((await t.asUser(isasParent, (tx) => loadNews(tx, isaFamily))).map((n) => n.id)).not.toContain(message);
  });

  it("counts and lists only the chosen children's parents, and names the children", async () => {
    const detail = (await t.asUser(admin, (tx) => loadNewsDetail(tx, message)))!;
    expect(detail.news.audienceCount).toBe(2);
    expect(detail.unread.map((u) => u.id).sort()).toEqual([DEV_IDS.adnan, DEV_IDS.sara].sort());
    // Only Musa is named in the unread list's children, not Yusuf (U10), whom the message isn't about.
    expect(detail.unread.map((u) => u.children)).toEqual(["Musa", "Musa"]);
    expect(detail.news.chosen).toEqual(["Musa S."]);
    expect(audienceLabel(detail.news)).toBe("1 child: Musa S.");
    const coachView = (await t.asUser(coach, (tx) => loadNewsDetail(tx, message, ["U7"])))!;
    expect([coachView.news.audienceCount, coachView.unread.length]).toEqual([2, 2]);
    const listed = (await t.asUser(admin, (tx) => loadNewsList(tx))).find((n) => n.id === message)!;
    expect([listed.audienceCount, listed.readCount, listed.chosen]).toEqual([2, 0, ["Musa S."]]);
    // An ordinary message isn't one to chosen children.
    expect((await t.asUser(admin, (tx) => loadNewsList(tx))).filter((n) => n.id !== message).every((n) => n.chosen === null)).toBe(true);
  });

  it("chases only the chosen children's parents", async () => {
    const sent: ChaseTarget[] = [];
    const record = async (targets: ChaseTarget[]) => {
      sent.push(...targets);
      return targets;
    };
    const senders = { pushUsers: async () => new Set([adnan, sara, nuhsParent]), app: record, email: record, sms: record };
    const result = await t.asSystem((tx: Queryable) => runLadder(tx, new Date(posted.getTime() + 49 * 3600000), senders, message));
    expect(result.failed).toEqual([]);
    const reached = [...new Set(sent.map((s) => s.guardianId))].sort();
    expect(reached).toEqual([DEV_IDS.adnan, DEV_IDS.sara].sort());
    expect(sent.every((s) => s.children.join() === "Musa")).toBe(true);
    expect(sent.map((s) => s.guardianId)).not.toContain(await guardianId("parent16@example.com"));
  });
});

describe("choosing children", () => {
  it("lets a group coach choose only children in their own groups", async () => {
    const refused = await t.asUser(coach, (tx) => checkChosenChildren(tx, [DEV_IDS.musa, DEV_IDS.yusuf], ["U7"]));
    expect(refused).toEqual({ error: "You can choose children in your own groups only (U7). Yusuf isn't in them." });
    expect(await t.asUser(coach, (tx) => checkChosenChildren(tx, [DEV_IDS.musa, DEV_IDS.musa], ["U7"]))).toEqual({ groups: ["U7"] });
    // The picker lists only their groups' children, with their parents.
    const list = await t.asUser(coach, (tx) => loadNewsChildren(tx, ["U7"]));
    expect(new Set(list.map((c) => c.ageGroup))).toEqual(new Set(["U7"]));
    expect(list.find((c) => c.id === DEV_IDS.musa)?.guardians.sort()).toEqual([DEV_IDS.adnan, DEV_IDS.sara].sort());
  });

  it("refuses none, too many and children who aren't in the club", async () => {
    expect(await t.asUser(admin, (tx) => checkChosenChildren(tx, [], null))).toEqual({ error: "Choose at least one child." });
    const many = Array.from({ length: CHOSEN_MAX + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(await t.asUser(admin, (tx) => checkChosenChildren(tx, many, null))).toEqual({ error: "Choose up to 200 children. For more, send it to their groups." });
    const gone = await t.asUser(admin, (tx) => checkChosenChildren(tx, [DEV_IDS.musa, "00000000-0000-4000-8000-000000000999"], null));
    expect(gone).toEqual({ error: "One of those children isn't in the club any more. Reload and try again." });
    // Across groups, the audience is every group they're in, in the club's order.
    expect(await t.asUser(admin, (tx) => checkChosenChildren(tx, [DEV_IDS.yusuf, DEV_IDS.musa], null))).toEqual({ groups: ["U7", "U10"] });
  });
});
