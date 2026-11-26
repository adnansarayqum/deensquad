import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { insertNews } from "../admin/news";
import {
  addMessage,
  chatThread,
  conversationChild,
  loadChats,
  loadFamilyChat,
  loadReplyTarget,
  markChatRead,
  startParentConversation,
  startStaffConversation,
} from "./data";

// One chat per family (migration 0060): a family's conversations as one timeline, where a new message goes, the
// staff list by family, and a coach of one child reading the whole family's chat.

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string;
let sara: string;
let admin: string;
let coach: string;
let adminStaffId: string;
let coachStaffId: string;
const family = [DEV_IDS.yusuf, DEV_IDS.musa];

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  admin = await t.signIn(DEV_EMAILS.admin);
  coach = await t.signIn(DEV_EMAILS.coach);
  [{ id: adminStaffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  [{ id: coachStaffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.coach]));
});

describe("a family's chat", () => {
  let direct: string;
  let reply: string;
  let newsId: string;

  it("is every conversation about its children as one timeline, with what each message belongs to", async () => {
    direct = await t.asUser(adnan, (tx) => startParentConversation(tx, { childId: DEV_IDS.yusuf, subject: "Boots", body: "What studs for the 3G?", reply: null }));
    newsId = await t.asUser(admin, (tx) =>
      insertNews(tx, { topic: "General", title: "Photo day", body: "Friday", audience: null, requiresAck: true, postedBy: adminStaffId, allowReplies: true, squadSession: null, children: null }),
    );
    reply = await t.asUser(sara, async (tx) => {
      const target = await loadReplyTarget(tx, newsId, DEV_IDS.musa, family);
      return startParentConversation(tx, { childId: DEV_IDS.musa, subject: null, body: "Musa will be there", reply: target });
    });
    await t.asUser(admin, (tx) => addMessage(tx, direct, "staff", "Moulded studs or astro trainers."));

    const chat = (await t.asUser(adnan, (tx) => loadFamilyChat(tx, { parent: family })))!;
    expect(chat.messages.map((m) => [m.body, m.context.kind, m.context.label, m.context.child, m.mine])).toEqual([
      ["What studs for the 3G?", "direct", "Boots", "Yusuf", true],
      ["Musa will be there", "reply", "Replying to “Photo day”", "Musa", false],
      ["Moulded studs or astro trainers.", "direct", "Boots", "Yusuf", false],
    ]);
    expect(chat.children.map((c) => c.firstName)).toEqual(["Yusuf", "Musa"]);
    // The club's answer is new to Adnan until he opens the chat.
    expect(chat.firstNew).toBe(chat.messages[2].id);
    expect(chat.about).toBe(DEV_IDS.yusuf);
    await t.asUser(adnan, (tx) => markChatRead(tx, { parent: family }));
    expect((await t.asUser(adnan, (tx) => loadFamilyChat(tx, { parent: family })))!.firstNew).toBeNull();
  });

  it("is the same chat for staff from either child, and lists once per family with what's unread", async () => {
    const fromYusuf = (await t.asUser(admin, (tx) => loadFamilyChat(tx, { staff: DEV_IDS.yusuf })))!;
    const fromMusa = (await t.asUser(admin, (tx) => loadFamilyChat(tx, { staff: DEV_IDS.musa })))!;
    expect(fromMusa.messages.map((m) => m.id)).toEqual(fromYusuf.messages.map((m) => m.id));
    expect(fromYusuf.parents.map((p) => p.name)).toEqual(["Adnan Sample", "Sara Sample"]);
    // Sara's reply is the one message the admin hasn't read (they wrote in the other conversation, which reads it).
    expect(fromYusuf.firstNew).toBe(fromYusuf.messages[1].id);

    const rows = await t.asUser(admin, (tx) => loadChats(tx));
    const row = rows.filter((r) => r.children.some((c) => c.id === DEV_IDS.yusuf));
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({ unread: 1, parents: ["Adnan Sample", "Sara Sample"], last: { authorKind: "staff", preview: "Moulded studs or astro trainers." } });
    expect(row[0].children.map((c) => c.firstName)).toEqual(["Yusuf", "Musa"]);
    expect((await t.asUser(admin, (tx) => loadChats(tx, { unreadOnly: true }))).map((r) => r.key)).toContain(row[0].key);

    await t.asUser(admin, (tx) => markChatRead(tx, { staff: DEV_IDS.musa }));
    expect((await t.asUser(admin, (tx) => loadChats(tx))).find((r) => r.key === row[0].key)!.unread).toBe(0);
    expect((await t.asUser(admin, (tx) => loadChats(tx, { unreadOnly: true }))).map((r) => r.key)).not.toContain(row[0].key);
  });

  it("puts a new message in the conversation the latest one is in, or the chosen child's own", async () => {
    // The latest message is the club's, about Yusuf's boots: an answer stays with it.
    expect(await t.asUser(adnan, (tx) => chatThread(tx, { parent: family }, null))).toEqual({ conversationId: direct });
    expect(await t.asUser(adnan, (tx) => chatThread(tx, { parent: family }, DEV_IDS.yusuf))).toEqual({ conversationId: direct });
    // About Musa instead: he has only a reply to a post, so it starts his own conversation.
    expect(await t.asUser(adnan, (tx) => chatThread(tx, { parent: family }, DEV_IDS.musa))).toEqual({ child: DEV_IDS.musa });
    // Staff answering Sara's reply stay in it.
    await t.asUser(sara, (tx) => addMessage(tx, reply, "parent", "What time?"));
    expect(await t.asUser(admin, (tx) => chatThread(tx, { staff: DEV_IDS.yusuf }, null))).toEqual({ conversationId: reply });
  });

  it("keeps a parent's next message out of their own 'not coming' reason, but lets staff answer it", async () => {
    const [session] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where starts_at > now() and 'U10' = any (age_groups) order by starts_at limit 1`));
    const reason = await t.asUser(adnan, async (tx) => {
      const [c] = await tx.query<{ id: string }>(
        `insert into conversations (player_id, started_by_user, started_by_kind, subject, session_id) values ($1, auth.uid(), 'parent', 'Not coming: Training', $2) returning id`,
        [DEV_IDS.yusuf, session.id],
      );
      await addMessage(tx, c.id, "parent", "At his cousin's wedding");
      return c.id;
    });
    expect(await t.asUser(adnan, (tx) => chatThread(tx, { parent: family }, null))).toEqual({ conversationId: direct });
    expect(await t.asUser(admin, (tx) => chatThread(tx, { staff: DEV_IDS.yusuf }, null))).toEqual({ conversationId: reason });
    const chat = (await t.asUser(admin, (tx) => loadFamilyChat(tx, { staff: DEV_IDS.yusuf })))!;
    expect(chat.messages.at(-1)).toMatchObject({ body: "At his cousin's wedding", context: { kind: "absence", label: "Not coming: Training" } });
    // A "not coming" reason isn't counted as unread in the list (it has its own tab and the register).
    const row = (await t.asUser(admin, (tx) => loadChats(tx))).find((r) => r.children.some((c) => c.id === DEV_IDS.yusuf))!;
    expect(row.last).toMatchObject({ preview: "At his cousin's wedding" });
  });
});

describe("who reads a family's chat", () => {
  it("a coach of one child reads the whole family's chat, and nobody else's coach does", async () => {
    // Coach Hamza now coaches U7 only: Musa is his, Yusuf (U10) is Musa's brother.
    await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U7}' where id = $1`, [coachStaffId]));
    const chat = (await t.asUser(coach, (tx) => loadFamilyChat(tx, { staff: DEV_IDS.musa })))!;
    expect(chat.messages.some((m) => m.context.child === "Yusuf")).toBe(true);
    expect(chat.children.map((c) => c.firstName)).toEqual(["Yusuf", "Musa"]);
    // He can answer in Yusuf's conversation (it's in the family's chat), though he can't start one about a U10 child.
    const thread = chat.messages.find((m) => m.context.child === "Yusuf")!.conversationId;
    await t.asUser(coach, (tx) => addMessage(tx, thread, "staff", "See you Friday."));
    await expect(t.asUser(coach, (tx) => startStaffConversation(tx, { childId: DEV_IDS.yusuf, staffId: coachStaffId, subject: null, body: "Hello" }))).rejects.toThrow();

    // A U10 family with no U7 child: not his.
    const [other] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`select p.id from players p where p.age_group = 'U10' and p.id <> $1 order by p.first_name limit 1`, [DEV_IDS.yusuf]),
    );
    const theirs = await t.asUser(admin, (tx) => startStaffConversation(tx, { childId: other.id, staffId: adminStaffId, subject: null, body: "Kit is ready" }));
    expect(await t.asUser(coach, (tx) => loadFamilyChat(tx, { staff: other.id }))).toBeNull();
    expect(await t.asUser(coach, (tx) => conversationChild(tx, theirs, "staff"))).toBeNull();
    expect((await t.asUser(coach, (tx) => loadChats(tx))).some((r) => r.children.some((c) => c.id === other.id))).toBe(false);
    // And a parent never reads another family's.
    expect(await t.asUser(adnan, (tx) => conversationChild(tx, theirs, { parent: family }))).toBeNull();
    expect(await t.asUser(adnan, (tx) => tx.query(`select id from conversation_messages where conversation_id = $1`, [theirs]))).toEqual([]);
    await t.asSystem((tx) => tx.query(`update staff set age_groups = '{}' where id = $1`, [coachStaffId]));
  });

  it("gives parents no way to list families", async () => {
    expect(await t.asUser(adnan, (tx) => tx.query(`select * from player_families()`))).toEqual([]);
  });
});
