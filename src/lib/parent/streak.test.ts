// A session still under way doesn't count against a child's streak or attendance until it has finished
// (or they're checked in). Parents looked at the Player screen during Friday training and saw the streak at 0.
import { beforeAll, describe, expect, it } from "vitest";
import type { Child } from "@/lib/domain";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { loadPlayerFacts } from "./data";
import { computeStats } from "./views";

// A Friday in October (BST). The sample club's Friday session runs 6:30pm to 8pm London.
const BEFORE = new Date("2031-10-17T16:00:00Z"); // 5pm
const DURING = new Date("2031-10-17T18:00:00Z"); // 7pm
const AFTER = new Date("2031-10-17T19:30:00Z"); // 8:30pm

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string;
let yusuf: Child;

const stats = (now: Date) => t.asUser(adnan, async (tx) => {
  const facts = await loadPlayerFacts(tx, yusuf, now);
  return computeStats(facts.past, facts.attended);
});

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: BEFORE });
  adnan = await t.signIn(DEV_EMAILS.parent);
  const [row] = await t.asSystem((tx) =>
    tx.query<{ age_group: Child["ageGroup"]; joined_on: string }>(`select age_group::text, joined_on::text from players where id = $1`, [DEV_IDS.yusuf]),
  );
  yusuf = { id: DEV_IDS.yusuf, firstName: "Yusuf", lastName: "S", shirtNumber: null, ageGroup: row.age_group, position: null, joinedOn: row.joined_on, photoConsent: null };
});

describe("streak and attendance while a session is under way", () => {
  it("stay as they were until the session has finished", async () => {
    expect(await stats(DURING)).toEqual(await stats(BEFORE));
  });

  it("count the session once the child is checked in, even before it ends", async () => {
    const before = await stats(BEFORE);
    await t.asSystem((tx) =>
      tx.query(
        `insert into attendance (session_id, player_id, method)
         select id, $1, 'manual' from sessions where starts_at <= $2 and ends_at > $2 and kind = 'training'`,
        [DEV_IDS.yusuf, DURING],
      ),
    );
    const during = await stats(DURING);
    expect(during.sessions).toBe(before.sessions + 1);
    expect(during.streakWeeks).toBeGreaterThanOrEqual(1);
  });

  it("count a finished session the child missed", async () => {
    await t.asSystem((tx) => tx.query(`delete from attendance where player_id = $1 and session_id in (select id from sessions where starts_at <= $2 and ends_at > $2)`, [DEV_IDS.yusuf, DURING]));
    expect((await stats(AFTER)).streakWeeks).toBe(0);
  });
});
