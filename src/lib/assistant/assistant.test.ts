// The admins' assistant: tools answer only from the app (as the admin, under RLS), never read medical or wellbeing
// data, and change nothing; drafts happen once, on Confirm, through the same functions as the Sessions and News pages.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { loadFamilies } from "@/lib/admin/data";
import { testDatabase } from "../../../test/db";
import { applyDraft, dismissDraft } from "./confirm";
import { askAssistant, type Deps } from "./run";
import { runTool, type ToolContext } from "./tools";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let coach: string;
let ctx: ToolContext;
let coachStaff: string;
const NOW = new Date("2026-10-28T12:00:00Z");

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: NOW });
  admin = await t.signIn(DEV_EMAILS.admin);
  coach = await t.signIn(DEV_EMAILS.coach);
  const staff = await t.asSystem((tx) => tx.query<{ id: string; email: string }>(`select id, email from staff`));
  ctx = { now: NOW, staffId: staff.find((s) => s.email === DEV_EMAILS.admin)!.id };
  coachStaff = staff.find((s) => s.email === DEV_EMAILS.coach)!.id;
  // A medical note for Yusuf, which the assistant must never see.
  await t.asSystem((tx) =>
    tx.query(`insert into player_medical (player_id, allergies, consent_at) values ($1, 'Peanuts SECRET', now())`, [DEV_IDS.yusuf]),
  );
});

const tool = (name: string, input: Record<string, unknown> = {}) => t.asUser(admin, (tx) => runTool(tx, name, input, ctx));

describe("the assistant's tools", () => {
  it("finds a family by a parent's name and gives the child's details, without medical needs", async () => {
    const found = (await tool("find_people", { name: "adnan" })).content as { matches: { child_id: string; child: string }[] };
    expect(found.matches.map((m) => m.child_id).sort()).toEqual([DEV_IDS.yusuf, DEV_IDS.musa].sort());
    const details = (await tool("child_details", { child_id: DEV_IDS.yusuf })).content as Record<string, unknown>;
    expect(details).toMatchObject({ group: expect.any(String), link: `/admin/families/${DEV_IDS.yusuf}` });
    expect(JSON.stringify(details)).not.toMatch(/SECRET|medical|allerg/i);
    expect((await tool("child_details", { child_id: "nope" })).content).toMatchObject({ error: expect.any(String) });
  });

  it("lists children needing something exactly as the Families list does", async () => {
    const out = (await tool("children_needing", { need: "payment" })).content as { count: number; link: string };
    const list = await t.asUser(admin, (tx) => loadFamilies(tx, null, undefined, { need: "payment" }));
    expect(out.count).toBe(list.length);
    expect(out.link).toBe("/admin/families?need=payment");
  });

  it("drafts sessions without adding them; Confirm adds them once, skipping any that exist", async () => {
    const count = () => t.asSystem(async (tx) => (await tx.query<{ n: number }>(`select count(*)::int as n from sessions where title = 'Assistant training'`))[0].n);
    const input = { kind: "training", title: "Assistant training", groups: ["U10"], date: "2026-11-06", repeat_until: "2026-11-27", start: "17:00", end: "18:15", venue: "Bobby Moore Sports Hub" };
    const first = await tool("propose_add_sessions", input);
    expect(first.draft?.summary).toMatch(/^Add 4 sessions: Assistant training for U10, 5:00pm–6:15pm/);
    expect(await count()).toBe(0);
    const applied = await t.asUser(admin, (tx) => applyDraft(tx, first.draft!.id, ctx.staffId));
    expect(applied).toMatchObject({ ok: true, message: expect.stringMatching(/^Added 4 sessions/) });
    expect(await count()).toBe(4);
    // A second tap does nothing.
    expect(await t.asUser(admin, (tx) => applyDraft(tx, first.draft!.id, ctx.staffId))).toMatchObject({ ok: false });
    expect(await count()).toBe(4);
    // The same again: nothing left to add.
    expect((await tool("propose_add_sessions", input)).content).toMatchObject({ error: expect.stringMatching(/already exists/) });
    // Times out of order, or in the past, are refused.
    expect((await tool("propose_add_sessions", { ...input, start: "18:15", end: "17:00" })).content).toMatchObject({ error: expect.any(String) });
    expect((await tool("propose_add_sessions", { ...input, date: "2026-10-01", repeat_until: undefined })).content).toMatchObject({ error: expect.stringMatching(/past/) });
  });

  it("cancels a session and posts news only on Confirm; Not now leaves it", async () => {
    const sessions = (await tool("list_sessions", { from: "2026-11-06", to: "2026-11-06", group: "U10" })).content as { sessions: { session_id: string; title: string }[] };
    const s = sessions.sessions.find((x) => x.title === "Assistant training")!;
    const draft = (await tool("propose_cancel_session", { session_id: s.session_id, reason: "Pitch waterlogged" })).draft!;
    const cancelled = async () => (await t.asSystem((tx) => tx.query<{ c: boolean }>(`select cancelled_at is not null as c from sessions where id = $1`, [s.session_id])))[0].c;
    expect(await cancelled()).toBe(false);
    expect(await t.asUser(admin, (tx) => applyDraft(tx, draft.id, ctx.staffId))).toMatchObject({ ok: true, chase: expect.any(String) });
    expect(await cancelled()).toBe(true);

    const news = (await tool("propose_news", { topic: "General", title: "Assistant news", body: "Hello", groups: ["U7"] })).draft!;
    await t.asUser(admin, (tx) => dismissDraft(tx, news.id, ctx.staffId));
    expect(await t.asUser(admin, (tx) => applyDraft(tx, news.id, ctx.staffId))).toMatchObject({ ok: false });
    const posted = await t.asSystem((tx) => tx.query(`select 1 from announcements where title = 'Assistant news'`));
    expect(posted).toHaveLength(0);
  });

  it("is the admins' alone: a coach can't keep or confirm drafts", async () => {
    await expect(
      t.asUser(coach, (tx) => runTool(tx, "propose_news", { topic: "General", title: "Coach", body: "x" }, { now: NOW, staffId: coachStaff })),
    ).rejects.toThrow();
    const draft = (await tool("propose_news", { topic: "General", title: "Admin draft", body: "x" })).draft!;
    expect(await t.asUser(coach, (tx) => applyDraft(tx, draft.id, coachStaff))).toMatchObject({ ok: false });
  });
});

describe("asking a question", () => {
  it("runs the tools Claude asks for and answers in words, with any drafts", async () => {
    const requests: Record<string, unknown>[] = [];
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "children_needing", input: { need: "contract" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Here they are. [Families](/admin/families?need=contract)" }] },
    ];
    const deps: Deps = { call: async (r) => (requests.push(r), replies.shift()), withTx: (fn) => t.asUser(admin, fn), model: "test" };
    const answer = await askAssistant("Who hasn't signed the contract?", [{ role: "assistant", text: "Hello" }], { ...ctx, adminName: "Ibrahim" }, deps);
    expect(answer).toEqual({ reply: "Here they are. [Families](/admin/families?need=contract)", drafts: [] });
    // The tool's answer went back to Claude, and the history started with the admin's turn.
    const second = requests[1].messages as { role: string; content: unknown }[];
    expect(second[0].role).toBe("user");
    expect(JSON.stringify(second.at(-1))).toContain("Contract not signed");
    expect(String(requests[0].system)).toContain("Today is Wednesday 2026-10-28");
  });
});
