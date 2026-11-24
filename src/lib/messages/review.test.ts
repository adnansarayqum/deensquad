import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { insertNews } from "../admin/news";
import { mentionsHealth } from "./absence";
import { loadInbox, loadReplyGroups, loadReplyTarget, loadStaffUnread, loadThread, markAbsencesSeen, markRead, startParentConversation } from "./data";
import { dueNotices } from "./notify";

// The messaging review (23 Nov 2026): replies gathered by post, injuries flagged in Not coming, "Seen by" for
// parents, and messages for the club's admins.

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string;
let admin: string;
let coach: string;
let adminStaffId: string;

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  admin = await t.signIn(DEV_EMAILS.admin);
  coach = await t.signIn(DEV_EMAILS.coach);
  [{ id: adminStaffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
});

describe("replies to posts", () => {
  it("are gathered under their post, out of the list of conversations, and count once in the badge", async () => {
    const before = await t.asUser(admin, (tx) => loadStaffUnread(tx));
    const newsId = await t.asUser(admin, (tx) =>
      insertNews(tx, { topic: "General", title: "Test Message", body: "All good?", audience: null, requiresAck: true, postedBy: adminStaffId, allowReplies: true, squadSession: null, children: null }),
    );
    const sara = await t.signIn(DEV_EMAILS.secondParent);
    for (const [user, child] of [
      [adnan, DEV_IDS.yusuf],
      [sara, DEV_IDS.musa],
    ] as const) {
      await t.asUser(user, async (tx) => {
        const reply = await loadReplyTarget(tx, newsId, child, [DEV_IDS.yusuf, DEV_IDS.musa]);
        await startParentConversation(tx, { childId: child, subject: null, body: "All good my end", reply });
      });
    }
    const groups = await t.asUser(admin, (tx) => loadReplyGroups(tx, { unreadOnly: true }));
    expect(groups).toEqual([expect.objectContaining({ newsId, title: "Test Message", replies: 2, unread: 2 })]);
    const direct = await t.asUser(admin, (tx) => loadInbox(tx, { direct: true }));
    expect(direct.map((r) => r.title)).not.toContain("Re: Test Message");
    // Two replies to one post are one thing to look at.
    expect(await t.asUser(admin, (tx) => loadStaffUnread(tx))).toBe(before + 1);
    // Opening the post's replies still lists each family's.
    expect(await t.asUser(admin, (tx) => loadInbox(tx, { about: newsId }))).toHaveLength(2);
  });
});

describe("not coming reasons", () => {
  it("spots injuries and illness, not the weather", () => {
    for (const s of ["Fractured finger", "broke his arm, out 3 weeks", "Head injury at school, treatment given with glue", "He's unwell", "Mrs still at hospital"]) expect(mentionsHealth(s)).toBe(true);
    for (const s of ["Bad weather", "Rain is rain", "Family wedding", "Football cancelled", "Away this weekend"]) expect(mentionsHealth(s)).toBe(false);
  });

  it("lists a new injury first, and tells the parent once a coach has seen it on the register", async () => {
    const [session] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where starts_at > now() and 'U10' = any (age_groups) order by starts_at limit 1`));
    const start = (child: string, body: string) =>
      t.asUser(adnan, async (tx) => {
        const [c] = await tx.query<{ id: string }>(
          `insert into conversations (player_id, started_by_user, started_by_kind, subject, session_id) values ($1, auth.uid(), 'parent', 'Not coming', $2) returning id`,
          [child, session.id],
        );
        await tx.query(`insert into conversation_messages (conversation_id, author_user, author_kind, author_name, body) values ($1, auth.uid(), 'parent', '', $2)`, [c.id, body]);
        return c.id;
      });
    const injury = await start(DEV_IDS.yusuf, "Fractured finger");
    await start(DEV_IDS.musa, "Rain is rain");
    const list = await t.asUser(admin, (tx) => loadInbox(tx, { absences: true }));
    expect(list[0]).toMatchObject({ id: injury, health: true, unread: true });
    expect(list.find((r) => r.id !== injury)!.health).toBe(false);

    const ids = [DEV_IDS.yusuf, DEV_IDS.musa];
    expect((await t.asUser(adnan, (tx) => loadThread(tx, injury, { parent: ids })))!.seenBy).toBeNull();
    await t.asUser(coach, (tx) => markAbsencesSeen(tx, session.id, [DEV_IDS.yusuf]));
    expect((await t.asUser(adnan, (tx) => loadThread(tx, injury, { parent: ids })))!.seenBy).toBe("Coach Hamza");
    // Another family can't ask who has seen it.
    const other = await t.signIn("parent16@example.com");
    const [row] = await t.asUser(other, (tx) => tx.query<{ by: string | null }>(`select conversation_seen_by($1) as by`, [injury]));
    expect(row.by).toBeNull();
  });
});

describe("a message for the club's admins", () => {
  it("tells the admins, not the group's coaches, and says so on the thread", async () => {
    await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U10}' where email = $1`, [DEV_EMAILS.coach]));
    const id = await t.asUser(adnan, (tx) => startParentConversation(tx, { childId: DEV_IDS.yusuf, subject: "Refund", body: "Charged twice for the kit.", reply: null, forAdmins: true }));
    const due = await t.asSystem((tx) => dueNotices(tx, new Date(Date.now() + 60_000), id));
    expect(due.filter((d) => d.side === "staff").map((d) => d.recipientId)).toEqual([adminStaffId]);
    const thread = (await t.asUser(admin, (tx) => loadThread(tx, id, "staff")))!;
    expect(thread.forAdmins).toBe(true);
    await t.asUser(admin, (tx) => markRead(tx, id));
    expect((await t.asUser(adnan, (tx) => loadThread(tx, id, { parent: [DEV_IDS.yusuf] })))!.seenBy).toBe("Ibrahim Khan");
  });
});
