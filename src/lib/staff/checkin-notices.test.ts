import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import type { PushPayload } from "../chase/senders";
import { checkedInMessage, sendCheckInNotices } from "./checkin-notices";

// "Musa is checked in" for parents (migration 0057).

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string;
let session: string;
const sent: Map<string, PushPayload>[] = [];
const push = async (_tx: unknown, payloads: Map<string, PushPayload>) => {
  sent.push(payloads);
  return new Set(payloads.keys());
};

beforeEach(async () => {
  sent.length = 0;
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  [{ id: session }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(`insert into sessions (title, starts_at, ends_at, venue, age_groups) values ('Training', now(), now() + interval '90 minutes', 'Hub', '{U10,U7}') returning id`),
  );
});

const checkIn = (player: string, at: Date) => t.asSystem((tx) => tx.query(`insert into attendance (session_id, player_id, checked_in_at) values ($1, $2, $3)`, [session, player, at]));

describe("checked-in notices", () => {
  it("says who, at which session and when", () => {
    expect(checkedInMessage(["Musa"], "Training", "2026-11-27T17:58:00Z")).toEqual({ title: "Musa is checked in", body: "Training, 5:58pm.", url: "/friday" });
    expect(checkedInMessage(["Musa", "Yusuf"], "Training", "2026-11-27T17:58:00Z").title).toBe("Musa and Yusuf are checked in");
  });

  it("waits a minute, tells each parent once for both children, and never tells old check-ins", async () => {
    const now = new Date();
    await checkIn(DEV_IDS.yusuf, new Date(now.getTime() - 30_000));
    expect(await t.asSystem((tx) => sendCheckInNotices(tx, now, push))).toBe(0);
    await checkIn(DEV_IDS.musa, new Date(now.getTime() - 20_000));
    const later = new Date(now.getTime() + 60_000);
    expect(await t.asSystem((tx) => sendCheckInNotices(tx, later, push))).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].get(adnan)!.title).toBe("Yusuf and Musa are checked in");
    expect(await t.asSystem((tx) => sendCheckInNotices(tx, later, push))).toBe(0);
    // Check-ins recorded for other days' sessions (the sample club's past ones) are never announced.
    const [{ n }] = await t.asSystem((tx) => tx.query<{ n: number }>(`select count(*)::int as n from attendance where session_id = $1 and parents_told_at is null`, [session]));
    expect(n).toBe(0);
  });

  it("sends nothing for a check-in undone within the minute", async () => {
    const now = new Date();
    await checkIn(DEV_IDS.yusuf, new Date(now.getTime() - 20_000));
    await t.asSystem((tx) => tx.query(`delete from attendance where session_id = $1`, [session]));
    expect(await t.asSystem((tx) => sendCheckInNotices(tx, new Date(now.getTime() + 60_000), push))).toBe(0);
  });
});
