import { describe, expect, it } from "vitest";
import { testDatabase } from "../../test/db";
import { HEARTBEAT_STALE_MS, lastHeartbeat, recordHeartbeat, staleHeartbeat } from "./cron-heartbeat";

describe("cron heartbeat", () => {
  it("records each run and says when the hourly jobs have stopped", async () => {
    const t = await testDatabase();
    expect(await t.asSystem((tx) => lastHeartbeat(tx))).toBeNull();
    const ran = new Date("2026-11-03T14:07:00Z");
    await t.asSystem((tx) => recordHeartbeat(tx, ran));
    await t.asSystem((tx) => recordHeartbeat(tx, ran));
    const last = await t.asSystem((tx) => lastHeartbeat(tx));
    expect(last?.toISOString()).toBe(ran.toISOString());
    expect(staleHeartbeat(last, new Date(ran.getTime() + HEARTBEAT_STALE_MS))).toBeNull();
    expect(staleHeartbeat(last, new Date(ran.getTime() + HEARTBEAT_STALE_MS + 60_000))?.toISOString()).toBe(ran.toISOString());
    expect(staleHeartbeat(null, new Date())).toBeNull();
  });
});
