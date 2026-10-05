import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS } from "../db/dev-seed";
import { cancelSession, removeSession } from "./sessions";

let t: Awaited<ReturnType<typeof testDatabase>>;
let coach: string;
let cup: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  coach = await t.signIn(DEV_EMAILS.coach);
  [{ id: cup }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where title = 'Autumn Cup'`));
});

const cancelledAt = (id: string) =>
  t.asSystem(async (tx) => (await tx.query<{ cancelled_at: string | null }>(`select cancelled_at::text from sessions where id = $1`, [id]))[0]?.cancelled_at);

describe("a U7 coach changing sessions", () => {
  it("can't cancel or delete the U10/U12/U15 Autumn Cup", async () => {
    expect(await t.asUser(coach, (tx) => cancelSession(tx, cup, true, ["U7"]))).toBe(false);
    expect(await cancelledAt(cup)).toBeNull();
    expect(await t.asUser(coach, (tx) => removeSession(tx, cup, ["U7"]))).toBe(false);
    expect(await cancelledAt(cup)).toBeNull();
  });

  it("can cancel, restore and delete a U7-only session", async () => {
    const [{ id }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('training', 'U7 extra', now() + interval '3 days', now() + interval '3 days 1 hour', 'Hub', '{U7}') returning id`,
      ),
    );
    expect(await t.asUser(coach, (tx) => cancelSession(tx, id, true, ["U7"]))).toBe(true);
    expect(await cancelledAt(id)).not.toBeNull();
    expect(await t.asUser(coach, (tx) => cancelSession(tx, id, false, ["U7"]))).toBe(true);
    expect(await cancelledAt(id)).toBeNull();
    expect(await t.asUser(coach, (tx) => removeSession(tx, id, ["U7"]))).toBe(true);
    expect(await cancelledAt(id)).toBeUndefined();
  });

  it("with no limit (an admin, or a coach with no groups) can cancel the cup", async () => {
    expect(await t.asUser(coach, (tx) => cancelSession(tx, cup, true, null))).toBe(true);
    expect(await cancelledAt(cup)).not.toBeNull();
  });
});
