import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { loadIncidents, logIncident, readLondonDateTime } from "./data";

const now = new Date("2026-10-09T18:00:00Z");

let t: Awaited<ReturnType<typeof testDatabase>>;
let coach: string;
let coachId: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true, now });
  coach = await t.signIn(DEV_EMAILS.coach);
  [{ id: coachId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.coach]));
});

const input = (playerId: string) => ({
  playerId,
  sessionId: null,
  kind: "injury" as const,
  happenedAt: new Date("2026-10-09T17:45:00Z"),
  whatHappened: "Fell in a tackle and hurt his left knee.",
  actionTaken: "Ice pack, sat out 10 minutes, carried on.",
  staff: { id: coachId, displayName: "Coach Hamza" },
});

describe("accidents and incidents", () => {
  it("are sent to the parents as a message, readable by them and staff, and can't be changed", async () => {
    const logged = await t.asUser(coach, (tx) => logIncident(tx, input(DEV_IDS.musa), null));
    expect(logged).toBeTruthy();
    // The parents' thread has it, from the coach.
    const parent = await t.signIn(DEV_EMAILS.parent);
    const messages = await t.asUser(parent, (tx) =>
      tx.query<{ body: string; author_kind: string; subject: string }>(
        `select m.body, m.author_kind, c.subject from conversation_messages m join conversations c on c.id = m.conversation_id where c.id = $1`,
        [logged!.conversationId],
      ),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].author_kind).toBe("staff");
    expect(messages[0].subject).toMatch(/^Injury report: Musa, /);
    expect(messages[0].body).toContain("What happened: Fell in a tackle");
    expect(messages[0].body).toContain("What we did: Ice pack");
    // Both the parent and staff read the record; another family doesn't.
    expect(await t.asUser(parent, (tx) => tx.query(`select id from incidents`))).toHaveLength(1);
    const other = await t.signIn("parent1@example.com");
    expect(await t.asUser(other, (tx) => tx.query(`select id from incidents`))).toHaveLength(0);
    const list = await t.asUser(coach, (tx) => loadIncidents(tx, { mine: null }));
    expect(list[0]).toMatchObject({ childName: "Musa S.", kind: "injury", reportedBy: "Coach Hamza", conversationId: logged!.conversationId });
    // A record: no updates or deletes, staff included.
    await expect(t.asUser(coach, (tx) => tx.query(`update incidents set what_happened = 'x'`))).rejects.toThrow(/permission denied/);
    await expect(t.asUser(coach, (tx) => tx.query(`delete from incidents`))).rejects.toThrow(/permission denied/);
    // Parents can't log one.
    await expect(
      t.asUser(parent, (tx) =>
        tx.query(`insert into incidents (player_id, kind, happened_at, what_happened, action_taken, reported_by_name) values ($1, 'other', now(), 'x', 'y', 'z')`, [DEV_IDS.musa]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("only for a group coach's own groups", async () => {
    // Musa is U7: a U10-only coach is refused, and nothing is written.
    await t.asSystem((tx) => tx.query(`update staff set age_groups = '{U10}' where id = $1`, [coachId]));
    expect(await t.asUser(coach, (tx) => logIncident(tx, input(DEV_IDS.musa), ["U10"]))).toBeNull();
    expect(await t.asSystem((tx) => tx.query(`select id from incidents`))).toHaveLength(0);
    expect(await t.asUser(coach, (tx) => logIncident(tx, input(DEV_IDS.yusuf), ["U10"]))).toBeTruthy();
  });

  it("reads the form's time as London time", () => {
    expect(readLondonDateTime("2026-10-09T18:45")?.toISOString()).toBe("2026-10-09T17:45:00.000Z");
    expect(readLondonDateTime("2026-12-09T18:45")?.toISOString()).toBe("2026-12-09T18:45:00.000Z");
    expect(readLondonDateTime("yesterday")).toBeNull();
  });
});
