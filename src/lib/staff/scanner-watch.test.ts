// The warning sign that the gate scanner isn't working: hand marking and no scans, at a club that uses the scanner.
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { QUIET_SCANNER_MANUAL, quietScanner } from "./scanner-watch";

let t: Awaited<ReturnType<typeof testDatabase>>;
let session: string;
let other: string;
let players: string[];

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  [{ id: session }, { id: other }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups)
       values ('training', 'Watch test', now(), now() + interval '1 hour', 'Hub', '{U10}'), ('training', 'Earlier', now() - interval '7 days', now() - interval '7 days' + interval '1 hour', 'Hub', '{U10}')
       returning id`,
    ),
  );
  players = (await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where age_group = 'U10' order by id limit 10`))).map((p) => p.id);
});

const mark = (sessionId: string, ids: string[], method: "manual" | "qr") =>
  t.asSystem((tx) => tx.query(`insert into attendance (session_id, player_id, method) select $1, unnest($2::uuid[]), $3`, [sessionId, ids, method]));

describe("a quiet scanner", () => {
  it("isn't flagged while the club has never scanned (it may not use the scanner)", async () => {
    await mark(session, players.slice(0, QUIET_SCANNER_MANUAL), "manual");
    expect(await t.asSystem((tx) => quietScanner(tx, session))).toBeNull();
  });

  it("is flagged once there are enough hand marks and no scans, at a club that scanned recently", async () => {
    await mark(other, players.slice(0, 1), "qr");
    expect(await t.asSystem((tx) => quietScanner(tx, session))).toEqual({ title: "Watch test", manual: QUIET_SCANNER_MANUAL });
  });

  it("isn't flagged once anyone has been scanned in", async () => {
    await mark(session, players.slice(QUIET_SCANNER_MANUAL, QUIET_SCANNER_MANUAL + 1), "qr");
    expect(await t.asSystem((tx) => quietScanner(tx, session))).toBeNull();
  });
});
