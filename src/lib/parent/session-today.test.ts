// hasSessionToday: the gold ring on the QR shortcut. Only a session today (London), for one of the family's
// children, going ahead and not yet finished, counts.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { hasSessionToday } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // parent of Yusuf (U10) and Musa (U7)

// A Wednesday in October (BST), well clear of the sample club's own sessions.
const NOW = new Date("2031-10-15T12:00:00Z");
const ids = () => [DEV_IDS.yusuf, DEV_IDS.musa];

async function addSession(start: string, end: string, groups: string[], cancelled = false) {
  const [{ id }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups, cancelled_at)
       values ('training', 'Test', $1, $2, 'Hub', $3::text[]::age_group[], case when $4 then now() end) returning id`,
      [start, end, groups, cancelled],
    ),
  );
  return id;
}
const clear = (id: string) => t.asSystem((tx) => tx.query(`delete from sessions where id = $1`, [id]));
const today = () => t.asUser(adnan, (tx) => hasSessionToday(tx, ids(), NOW));

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
});

describe("hasSessionToday", () => {
  it("is false with no session today", async () => {
    expect(await today()).toBe(false);
  });

  it("is true for a child's group session later today, and false once it has finished", async () => {
    const id = await addSession("2031-10-15T17:30:00Z", "2031-10-15T19:00:00Z", ["U7"]);
    expect(await today()).toBe(true);
    expect(await t.asUser(adnan, (tx) => hasSessionToday(tx, ids(), new Date("2031-10-15T19:30:00Z")))).toBe(false);
    await clear(id);
  });

  it("goes by the London day: 23:30 UTC is already tomorrow in October", async () => {
    const id = await addSession("2031-10-15T23:30:00Z", "2031-10-16T00:30:00Z", ["U10"]);
    expect(await today()).toBe(false);
    await clear(id);
  });

  it("ignores cancelled sessions and other groups' sessions", async () => {
    const cancelled = await addSession("2031-10-15T17:30:00Z", "2031-10-15T19:00:00Z", ["U10"], true);
    const otherGroup = await addSession("2031-10-15T17:30:00Z", "2031-10-15T19:00:00Z", ["U15"]);
    expect(await today()).toBe(false);
    await clear(cancelled);
    await clear(otherGroup);
  });

  it("is false with no children", async () => {
    expect(await t.asUser(adnan, (tx) => hasSessionToday(tx, [], NOW))).toBe(false);
  });
});
