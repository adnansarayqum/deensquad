// Wellbeing check-ins: a parent sends one only for their own child and only with consent; the family and the admins
// read it, coaches and other families never; "not great" or a note waits to be followed up; News asks about once a
// month after training.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { checkinForAlert, childrenToAsk, countOpenCheckins, giveCheckin, loadAdminCheckins, loadFamilyCheckins, markFollowedUp } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let coach: string;
let parent: string;
let adminStaff: string;
const NOW = new Date("2026-10-27T12:00:00Z");

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: NOW });
  admin = await t.signIn(DEV_EMAILS.admin);
  coach = await t.signIn(DEV_EMAILS.coach);
  parent = await t.signIn(DEV_EMAILS.parent);
  [{ id: adminStaff }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
});

describe("wellbeing check-ins", () => {
  it("needs consent and the parent's own child", async () => {
    await expect(t.asUser(parent, (tx) => giveCheckin(tx, DEV_IDS.yusuf, "good", null, false))).rejects.toThrow(/consent needed/);
    const [other] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where id <> all($1::uuid[]) limit 1`, [[DEV_IDS.yusuf, DEV_IDS.musa]]));
    await expect(t.asUser(parent, (tx) => giveCheckin(tx, other.id, "good", null, true))).rejects.toThrow(/not your child/);
  });

  it("is read by the family and the admins only; 'not great' waits for a follow-up", async () => {
    const id = await t.asUser(parent, (tx) => giveCheckin(tx, DEV_IDS.musa, "low", "Finding the older boys rough", true));
    expect((await t.asUser(parent, (tx) => loadFamilyCheckins(tx, [DEV_IDS.musa])))[0]).toMatchObject({ id, mood: "low", note: "Finding the older boys rough" });
    expect(await t.asUser(coach, (tx) => tx.query(`select * from wellbeing_checkins`))).toEqual([]);
    const { open } = await t.asUser(admin, (tx) => loadAdminCheckins(tx, NOW));
    expect(open.map((c) => c.id)).toEqual([id]);
    expect(await t.asUser(admin, countOpenCheckins)).toBe(1);
    // The alert email gets the first name and group only.
    expect(await t.asSystem((tx) => checkinForAlert(tx, id))).toEqual({ firstName: expect.any(String), group: "U7", needsLook: true });
    await t.asUser(admin, (tx) => markFollowedUp(tx, id, adminStaff));
    expect(await t.asUser(admin, countOpenCheckins)).toBe(0);
    // A coach can't mark one followed up either (no rows visible to them).
    await t.asUser(coach, (tx) => tx.query(`update wellbeing_checkins set followed_up_at = null`));
    expect(await t.asUser(admin, countOpenCheckins)).toBe(0);
  });

  it("a 'good' with no note needs nothing; a second one the same day replaces the first", async () => {
    await t.asUser(parent, (tx) => giveCheckin(tx, DEV_IDS.yusuf, "ok", null, true));
    await t.asUser(parent, (tx) => giveCheckin(tx, DEV_IDS.yusuf, "good", null, true));
    const mine = await t.asUser(parent, (tx) => loadFamilyCheckins(tx, [DEV_IDS.yusuf]));
    expect(mine.map((c) => c.mood)).toEqual(["good"]);
    expect(await t.asUser(admin, countOpenCheckins)).toBe(0);
  });

  it("asks on News only after training and not within 4 weeks of the last check-in", async () => {
    await t.asSystem((tx) => tx.query(`delete from wellbeing_checkins`));
    const attended = await t.asSystem((tx) =>
      tx.query<{ player_id: string }>(
        `select distinct a.player_id from attendance a join sessions s on s.id = a.session_id
         where a.player_id = any($1::uuid[]) and s.starts_at > $2::timestamptz - interval '7 days' and s.starts_at <= $2`,
        [[DEV_IDS.yusuf, DEV_IDS.musa], NOW],
      ),
    );
    const ask = await t.asUser(parent, (tx) => childrenToAsk(tx, [DEV_IDS.yusuf, DEV_IDS.musa], NOW));
    expect(ask.sort()).toEqual(attended.map((a) => a.player_id).sort());
    expect(ask.length).toBeGreaterThan(0);
    await t.asUser(parent, (tx) => giveCheckin(tx, ask[0], "good", null, true));
    expect(await t.asUser(parent, (tx) => childrenToAsk(tx, [ask[0]], NOW))).toEqual([]);
  });
});
