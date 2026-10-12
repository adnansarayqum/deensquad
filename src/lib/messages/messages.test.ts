import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { dueChases } from "../chase/ladder";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import type { Email } from "../email/send";
import { insertNews } from "../admin/news";
import { loadFamily, loadNews, loadQuickAnswers, saveQuickAnswer } from "../parent/data";
import {
  addMessage,
  countReplies,
  loadInbox,
  loadMessageChild,
  loadParentConversations,
  loadParentUnreadMessages,
  loadReplyTarget,
  loadStaffUnread,
  loadThread,
  markRead,
  startParentConversation,
  startStaffConversation,
} from "./data";
import { dueNotices, notifyMessages, type NoticeSenders } from "./notify";
import { parseQuickAnswers, tallyAnswers } from "./quick-answers";

// Messages between parents and the club on the sample club. Adnan and Sara share Yusuf (U10) and Musa (U7); Nuh's
// parent (parent16) is another U7 family. Coach Hamza coaches U7 only; Coach Zara U10 only.

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string;
let sara: string;
let nuhsParent: string;
let u7Coach: string;
let u10Coach: string;
let u10CoachStaffId: string;
let u7CoachStaffId: string;
let admin: string;
let adminStaffId: string;
let musaThread: string; // Adnan → "the coaches", about Musa (U7)

const sees = (user: string, sql: string, params: unknown[] = []) => t.asUser(user, (tx) => tx.query(sql, params));
const at = (iso: string) => new Date(iso);

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  nuhsParent = await t.signIn("parent16@example.com");
  await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U7}' where email = $1`, [DEV_EMAILS.coach]));
  await t.asSystem((tx) => tx.query(`insert into staff (email, display_name, role, age_groups) values ('zara@deensquad.test', 'Coach Zara', 'coach', '{U10}')`));
  u7Coach = await t.signIn(DEV_EMAILS.coach);
  u10Coach = await t.signIn("zara@deensquad.test");
  admin = await t.signIn(DEV_EMAILS.admin);
  const ids = await t.asSystem((tx) => tx.query<{ email: string; id: string }>(`select email, id from staff`));
  const staffId = (email: string) => ids.find((r) => r.email === email)!.id;
  adminStaffId = staffId(DEV_EMAILS.admin);
  u7CoachStaffId = staffId(DEV_EMAILS.coach);
  u10CoachStaffId = staffId("zara@deensquad.test");
  musaThread = await t.asUser(adnan, (tx) => startParentConversation(tx, { childId: DEV_IDS.musa, subject: "Musa's knee", body: "He hurt his knee at school.", reply: null }));
});

describe("who can read and write a conversation", () => {
  it("both of the child's parents, the group's coach and admins can read it; another family and another group's coach can't", async () => {
    const q = `select id from conversations where id = $1`;
    expect(await sees(adnan, q, [musaThread])).toHaveLength(1);
    expect(await sees(sara, q, [musaThread])).toHaveLength(1);
    expect(await sees(u7Coach, q, [musaThread])).toHaveLength(1);
    expect(await sees(admin, q, [musaThread])).toHaveLength(1);
    expect(await sees(nuhsParent, q, [musaThread])).toHaveLength(0);
    expect(await sees(u10Coach, q, [musaThread])).toHaveLength(0);
    const m = `select body from conversation_messages where conversation_id = $1`;
    expect(await sees(sara, m, [musaThread])).toEqual([{ body: "He hurt his knee at school." }]);
    expect(await sees(nuhsParent, m, [musaThread])).toHaveLength(0);
    expect(await sees(u10Coach, m, [musaThread])).toHaveLength(0);
    // The app's own loaders say the same.
    expect(await t.asUser(nuhsParent, (tx) => loadThread(tx, musaThread, { parent: [] }))).toBeNull();
    expect(await t.asUser(u10Coach, (tx) => loadThread(tx, musaThread, "staff"))).toBeNull();
    const thread = await t.asUser(sara, (tx) => loadThread(tx, musaThread, { parent: [DEV_IDS.yusuf, DEV_IDS.musa] }));
    expect(thread?.messages).toMatchObject([{ authorKind: "parent", authorName: "Adnan", mine: false }]);
    expect(thread?.title).toBe("Musa's knee");
  });

  it("the member of staff a conversation is addressed to can read it, even outside their groups", async () => {
    const [{ id }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`insert into conversations (player_id, started_by_kind, staff_id) values ($1, 'parent', $2) returning id`, [DEV_IDS.musa, u10CoachStaffId]),
    );
    expect(await sees(u10Coach, `select id from conversations where id = $1`, [id])).toHaveLength(1);
    expect(await t.asUser(u10Coach, (tx) => loadThread(tx, id, "staff"))).not.toBeNull();
    await t.asSystem((tx) => tx.query(`delete from conversations where id = $1`, [id]));
  });

  it("a parent can't write as staff, as someone else, or in another family's conversation", async () => {
    await expect(
      sees(adnan, `insert into conversation_messages (conversation_id, author_user, author_kind, author_name, body) values ($1, auth.uid(), 'staff', 'x', 'Hi')`, [musaThread]),
      // Refused before the policy is even checked: Adnan has no staff record to take a name from.
    ).rejects.toThrow(/row-level security|unknown author/);
    await expect(
      sees(adnan, `insert into conversation_messages (conversation_id, author_user, author_kind, author_name, body) values ($1, $2, 'parent', 'x', 'Hi')`, [musaThread, sara]),
    ).rejects.toThrow(/row-level security/);
    await expect(t.asUser(nuhsParent, (tx) => addMessage(tx, musaThread, "parent", "Hello"))).rejects.toThrow(/row-level security/);
    await expect(
      sees(nuhsParent, `insert into conversations (player_id, started_by_user, started_by_kind) values ($1, auth.uid(), 'parent')`, [DEV_IDS.musa]),
    ).rejects.toThrow(/row-level security/);
  });

  it("names the author from their own record, whatever the request says", async () => {
    await t.asUser(u7Coach, (tx) =>
      tx.query(`insert into conversation_messages (conversation_id, author_user, author_kind, author_name, body) values ($1, auth.uid(), 'staff', 'The Head Coach', 'Thanks, we will go easy.')`, [musaThread]),
    );
    const rows = await sees(admin, `select author_name, author_kind from conversation_messages where conversation_id = $1 order by created_at`, [musaThread]);
    expect(rows.at(-1)).toEqual({ author_name: "Coach Hamza", author_kind: "staff" });
  });

  it("nobody can change or delete a message, not even an admin", async () => {
    await expect(sees(admin, `update conversation_messages set body = 'changed' where conversation_id = $1`, [musaThread])).rejects.toThrow(/permission denied/);
    await expect(sees(admin, `delete from conversation_messages where conversation_id = $1`, [musaThread])).rejects.toThrow(/permission denied/);
    await expect(sees(adnan, `delete from conversations where id = $1`, [musaThread])).rejects.toThrow(/permission denied/);
    await expect(sees(adnan, `update conversations set subject = 'x' where id = $1`, [musaThread])).rejects.toThrow(/permission denied/);
  });
});

describe("unread and the inboxes", () => {
  it("counts the coach's reply as unread for each parent until they open it", async () => {
    expect(await t.asUser(adnan, (tx) => loadParentUnreadMessages(tx, [DEV_IDS.yusuf, DEV_IDS.musa]))).toBe(1);
    expect(await t.asUser(sara, (tx) => loadParentUnreadMessages(tx, [DEV_IDS.yusuf, DEV_IDS.musa]))).toBe(1);
    await t.asUser(sara, (tx) => markRead(tx, musaThread));
    expect(await t.asUser(sara, (tx) => loadParentUnreadMessages(tx, [DEV_IDS.yusuf, DEV_IDS.musa]))).toBe(0);
    expect(await t.asUser(adnan, (tx) => loadParentUnreadMessages(tx, [DEV_IDS.yusuf, DEV_IDS.musa]))).toBe(1);
    const list = await t.asUser(adnan, (tx) => loadParentConversations(tx, [DEV_IDS.yusuf, DEV_IDS.musa]));
    expect(list).toMatchObject([{ id: musaThread, childFirstName: "Musa", unread: true, last: { authorName: "Coach Hamza", preview: "Thanks, we will go easy." } }]);
    // Nobody else's.
    expect(await t.asUser(nuhsParent, (tx) => loadParentConversations(tx, ["20000000-0000-4000-8000-0000000000ff"]))).toEqual([]);
  });

  it("shows staff only the conversations they cover, with a parent's message unread until they open it", async () => {
    await t.asUser(sara, (tx) => addMessage(tx, musaThread, "parent", "Thank you."));
    expect(await t.asUser(u7Coach, loadStaffUnread)).toBe(1);
    expect(await t.asUser(admin, loadStaffUnread)).toBe(1);
    expect(await t.asUser(u10Coach, loadStaffUnread)).toBe(0);
    expect((await t.asUser(u10Coach, (tx) => loadInbox(tx))).map((r) => r.id)).not.toContain(musaThread);
    const inbox = await t.asUser(admin, (tx) => loadInbox(tx, { unreadOnly: true }));
    expect(inbox).toMatchObject([{ id: musaThread, child: { firstName: "Musa", ageGroup: "U7" }, unread: true, last: { authorName: "Sara", preview: "Thank you." } }]);
    expect(inbox[0].parents).toEqual(["Adnan Sample", "Sara Sample"]);
    await t.asUser(admin, (tx) => markRead(tx, musaThread));
    expect(await t.asUser(admin, loadStaffUnread)).toBe(0);
    expect(await t.asUser(admin, (tx) => loadInbox(tx, { unreadOnly: true }))).toEqual([]);
    expect(await t.asUser(u7Coach, loadStaffUnread)).toBe(1);
  });
});

describe("starting a conversation from the staff side", () => {
  it("a group coach can only start one with a family in their groups; an admin with any", async () => {
    expect(await t.asUser(u7Coach, (tx) => loadMessageChild(tx, DEV_IDS.yusuf, ["U7"]))).toBeNull();
    expect(await t.asUser(u7Coach, (tx) => loadMessageChild(tx, DEV_IDS.musa, ["U7"]))).toMatchObject({ firstName: "Musa", parents: ["Adnan Sample", "Sara Sample"] });
    // The database refuses too, whatever the app passes.
    await expect(t.asUser(u7Coach, (tx) => startStaffConversation(tx, { childId: DEV_IDS.yusuf, staffId: u7CoachStaffId, subject: null, body: "Hi" }))).rejects.toThrow(
      /row-level security/,
    );
    expect(await t.asUser(admin, (tx) => loadMessageChild(tx, DEV_IDS.yusuf, null))).not.toBeNull();
    const id = await t.asUser(admin, (tx) => startStaffConversation(tx, { childId: DEV_IDS.yusuf, staffId: adminStaffId, subject: "Kit", body: "Yusuf left his boots." }));
    expect(await sees(u10Coach, `select id from conversations where id = $1`, [id])).toHaveLength(1);
    expect(await sees(u7Coach, `select id from conversations where id = $1`, [id])).toHaveLength(0);
    // The admin's own message isn't unread for them.
    expect((await t.asUser(admin, (tx) => loadInbox(tx))).find((r) => r.id === id)?.unread).toBe(false);
  });
});

describe("quick answers and replies on club news", () => {
  let news: string;
  const posted = at("2030-06-03T11:00:00Z");

  beforeAll(async () => {
    news = await t.asUser(admin, (tx) =>
      insertNews(tx, {
        topic: "Matches",
        title: "Cup on Sunday: can your child play?",
        body: "Tell us by Thursday.",
        audience: ["U7"],
        requiresAck: true,
        postedBy: adminStaffId,
        squadSession: null,
        children: null,
        allowReplies: true,
        quickAnswers: ["Yes", "No", "Maybe"],
      }),
    );
    await t.asSystem((tx) => tx.query(`update announcements set posted_at = $2 where id = $1`, [news, posted]));
  });

  it("shows the options for the children it reaches", async () => {
    const family = (await t.asUser(adnan, loadFamily))!;
    const item = (await t.asUser(adnan, (tx) => loadNews(tx, family))).find((n) => n.id === news)!;
    expect(item).toMatchObject({ quickAnswers: ["Yes", "No", "Maybe"], allowReplies: true, reaches: [DEV_IDS.musa], read: false });
  });

  it("keeps one answer per child: the other parent's tap overwrites it, and it counts as read", async () => {
    expect(await t.asUser(adnan, (tx) => saveQuickAnswer(tx, news, DEV_IDS.musa, "Yes"))).toBe(true);
    expect(await t.asUser(sara, (tx) => saveQuickAnswer(tx, news, DEV_IDS.musa, "No"))).toBe(true);
    const rows = await t.asSystem((tx) => tx.query(`select answer from announcement_answers where announcement_id = $1`, [news]));
    expect(rows).toEqual([{ answer: "No" }]);
    const seen = await t.asUser(adnan, (tx) => loadQuickAnswers(tx, [news], [DEV_IDS.yusuf, DEV_IDS.musa], "10000000-0000-4000-8000-000000000001"));
    expect(seen.get(news)).toEqual({ [DEV_IDS.musa]: { answer: "No", byName: "Sara", mine: false } });
    // Both parents have read it now, so neither is chased.
    const due = await t.asSystem((tx) => dueChases(tx, "email", new Date(posted.getTime() + 25 * 3600_000), news));
    expect(due.map((d) => d.firstName)).not.toContain("Adnan");
    expect(due.map((d) => d.firstName)).not.toContain("Sara");
    expect(due.length).toBeGreaterThan(0); // the other U7 families still are
  });

  it("refuses an answer that isn't an option, for a child it doesn't reach, or for someone else's child", async () => {
    expect(await t.asUser(adnan, (tx) => saveQuickAnswer(tx, news, DEV_IDS.musa, "Perhaps"))).toBe(false);
    expect(await t.asUser(adnan, (tx) => saveQuickAnswer(tx, news, DEV_IDS.yusuf, "Yes"))).toBe(false);
    expect(await t.asUser(nuhsParent, (tx) => saveQuickAnswer(tx, news, DEV_IDS.musa, "Yes"))).toBe(false);
    await expect(sees(adnan, `insert into announcement_answers (announcement_id, player_id, answer) values ($1, $2, 'Yes')`, [news, DEV_IDS.musa])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("lets a parent reply only about a child it reaches, and a second reply joins the same thread", async () => {
    const ids = [DEV_IDS.yusuf, DEV_IDS.musa];
    expect(await t.asUser(adnan, (tx) => loadReplyTarget(tx, news, DEV_IDS.yusuf, ids))).toBeNull();
    const target = await t.asUser(adnan, (tx) => loadReplyTarget(tx, news, DEV_IDS.musa, ids));
    expect(target).toMatchObject({ postedBy: "Ibrahim Khan", postedById: adminStaffId });
    const first = await t.asUser(adnan, (tx) => startParentConversation(tx, { childId: DEV_IDS.musa, subject: null, body: "Can he come late?", reply: target }));
    const second = await t.asUser(sara, (tx) => startParentConversation(tx, { childId: DEV_IDS.musa, subject: null, body: "Also, which pitch?", reply: target }));
    expect(second).toBe(first);
    const thread = await t.asUser(admin, (tx) => loadThread(tx, first, "staff"));
    expect(thread).toMatchObject({ title: "Re: Cup on Sunday: can your child play?", newsId: news, withName: "Ibrahim Khan" });
    expect(thread!.messages).toHaveLength(2);
    expect(await t.asUser(admin, (tx) => countReplies(tx, news))).toBe(1);
    // Addressed to the admin who posted it, so the U7 coach sees it as the group's coach, the U10 coach not at all.
    expect(await t.asUser(u10Coach, (tx) => countReplies(tx, news))).toBe(0);
  });

  it("a message without replies turned on can't be replied to", async () => {
    const plain = await t.asUser(admin, (tx) =>
      insertNews(tx, { topic: "General", title: "Plain", body: "No replies.", audience: ["U7"], requiresAck: false, postedBy: adminStaffId, squadSession: null, children: null }),
    );
    expect(await t.asUser(adnan, (tx) => loadReplyTarget(tx, plain, DEV_IDS.musa, [DEV_IDS.musa]))).toBeNull();
  });

  it("tallies answers per option, then the children with none", () => {
    const { tally, none } = tallyAnswers(["Yes", "No"], [
      { answer: "Yes", name: "Musa S." },
      { answer: null, name: "Nuh E." },
      { answer: "Yes", name: "Isa G." },
    ]);
    expect(tally).toEqual([
      { answer: "Yes", children: ["Musa S.", "Isa G."] },
      { answer: "No", children: [] },
    ]);
    expect(none).toEqual(["Nuh E."]);
  });
});

describe("the post form's quick answers", () => {
  it("are off unless ticked, then 2 to 4 short, different answers", () => {
    expect(parseQuickAnswers(false, ["Yes", "No"])).toEqual({ answers: null });
    expect(parseQuickAnswers(true, [" Yes ", "No", "", ""])).toEqual({ answers: ["Yes", "No"] });
    expect(parseQuickAnswers(true, ["Yes", "", "", ""])).toHaveProperty("error");
    expect(parseQuickAnswers(true, ["Yes", "yes"])).toEqual({ error: "Each answer needs to be different." });
    expect(parseQuickAnswers(true, ["Yes", "x".repeat(31)])).toHaveProperty("error");
    expect(parseQuickAnswers(true, ["A", "B", "C", "D", "E"])).toHaveProperty("error");
  });

  it("are checked by the database too", async () => {
    await expect(
      t.asSystem((tx) => tx.query(`insert into announcements (topic, title, body, quick_answers) values ('General', 'x', 'y', '{Only one}')`)),
    ).rejects.toThrow(/announcements_quick_answers_ok/);
  });
});

describe("notifications", () => {
  let thread: string;
  const pushes: { users: string[]; title: string; body: string; url: string }[] = [];
  const emails: Email[] = [];
  let withPush = new Set<string>();
  const senders: NoticeSenders = {
    pushUsers: async () => withPush,
    push: async (_tx, users, payload) => {
      pushes.push({ users, ...payload });
      return new Set(users);
    },
    email: async (list) => {
      emails.push(...list);
      return { sent: list, failed: [] };
    },
    appUrl: "https://app.example",
  };
  const run = (now: string) => t.asSystem((tx) => notifyMessages(tx, at(now), senders, thread));
  // Sends as `user` at `when` (the author has read the thread up to then, as sending marks it read).
  const send = async (user: string, kind: "parent" | "staff", body: string, when: string) => {
    const id = await t.asUser(user, (tx) => addMessage(tx, thread, kind, body));
    await t.asSystem(async (tx) => {
      await tx.query(`update conversation_messages set created_at = $2 where id = $1`, [id, at(when)]);
      await tx.query(`update conversation_reads set last_read_at = $3 where conversation_id = $1 and user_id = $2`, [thread, user, at(when)]);
    });
  };

  beforeAll(async () => {
    withPush = new Set([u7Coach]);
    thread = await t.asUser(adnan, (tx) => startParentConversation(tx, { childId: DEV_IDS.musa, subject: null, body: "Is training on?", reply: null }));
    await t.asSystem((tx) => tx.query(`update conversation_messages set created_at = '2030-06-04T09:00:00Z' where conversation_id = $1`, [thread]));
  });

  it("pushes a parent's message to the group's coach (not the admin), never with the message text", async () => {
    const due = await t.asSystem((tx) => dueNotices(tx, at("2030-06-04T09:01:00Z"), thread));
    expect(due.map((d) => d.recipientId)).toEqual([u7CoachStaffId]);
    expect(await run("2030-06-04T09:01:00Z")).toMatchObject({ push: 1, email: 0 });
    expect(pushes.at(-1)).toMatchObject({ users: [u7Coach], title: "Adnan about Musa", body: "Open the app to read it.", url: `/admin/messages/${thread}` });
    // Nothing new: nothing more.
    expect(await run("2030-06-04T09:30:00Z")).toMatchObject({ push: 0 });
  });

  it("sends at most one notification per conversation per person every 15 minutes", async () => {
    await send(adnan, "parent", "Sorry, one more thing.", "2030-06-04T09:05:00Z");
    expect(await run("2030-06-04T09:10:00Z")).toMatchObject({ push: 0 });
    expect(await run("2030-06-04T09:16:00Z")).toMatchObject({ push: 1 });
    expect(pushes.at(-1)!.body).toBe("Open the app to read it.");
  });

  it("says nothing between 9pm and 8am London, then one notification after 8am if it's still unread", async () => {
    await send(adnan, "parent", "Late question.", "2030-06-04T21:30:00Z");
    expect(await run("2030-06-04T21:45:00Z")).toMatchObject({ quiet: true, push: 0 });
    expect(await run("2030-06-05T06:30:00Z")).toMatchObject({ quiet: true, push: 0 }); // 7:30am BST
    expect(await run("2030-06-05T07:05:00Z")).toMatchObject({ quiet: false, push: 1 }); // 8:05am BST
  });

  it("isn't sent once the person has read it", async () => {
    await send(adnan, "parent", "Read me.", "2030-06-05T10:00:00Z");
    await t.asUser(u7Coach, (tx) => markRead(tx, thread));
    await t.asSystem((tx) => tx.query(`update conversation_reads set last_read_at = '2030-06-05T10:01:00Z' where conversation_id = $1`, [thread]));
    expect(await run("2030-06-05T10:30:00Z")).toMatchObject({ push: 0, email: 0 });
  });

  it("tells both parents about a coach's reply: by email without the message when they have no notifications", async () => {
    await send(u7Coach, "staff", "Yes, training is on. Private note about Musa.", "2030-06-05T11:00:00Z");
    emails.length = 0;
    expect(await run("2030-06-05T11:01:00Z")).toMatchObject({ push: 0, email: 2 });
    expect(emails.map((e) => e.to).sort()).toEqual([DEV_EMAILS.parent, DEV_EMAILS.secondParent]);
    expect(emails[0].subject).toBe("New message from Coach Hamza about Musa");
    expect(emails[0].text).toContain(`https://app.example/messages/${thread}`);
    for (const e of emails) {
      expect(e.text).not.toContain("Private note");
      expect(e.html).not.toContain("Private note");
    }
  });

  it("goes to the admins when the child's group has no coach of its own", async () => {
    await t.asSystem((tx) => tx.query(`update staff set age_groups = '{}' where email = $1`, [DEV_EMAILS.coach]));
    await send(adnan, "parent", "Anyone there?", "2030-06-05T12:00:00Z");
    const due = await t.asSystem((tx) => dueNotices(tx, at("2030-06-05T12:01:00Z"), thread));
    expect(due.map((d) => d.recipientId)).toEqual([adminStaffId]);
    await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U7}' where email = $1`, [DEV_EMAILS.coach]));
  });
});

describe("removing a child", () => {
  it("deletes their conversations, messages and answers with them", async () => {
    const [{ id }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group) values ('Temp', 'Child', 'U7') returning id`),
    );
    await t.asSystem((tx) => tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [id, "10000000-0000-4000-8000-000000000001"]));
    const conv = await t.asUser(adnan, (tx) => startParentConversation(tx, { childId: id, subject: null, body: "Hi", reply: null }));
    await t.asUser(admin, (tx) => tx.query(`delete from players where id = $1`, [id]));
    const left = await t.asSystem((tx) => tx.query(`select 1 from conversation_messages where conversation_id = $1`, [conv]));
    expect(left).toHaveLength(0);
  });
});
