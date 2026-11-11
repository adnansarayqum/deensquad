// The payment moves written down in states.ts, checked against the real thing: the two database functions a parent
// calls are run from every starting state (PGlite, the sample club), so the map can't drift from the database.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import type { PaymentState } from "@/lib/domain";
import { testDatabase } from "../../../test/db";
import { isPaymentState, PAYMENT_MOVES, PAYMENT_OF_PS, PAYMENT_STATES, PAYMENT_TONE, STAFF_CAN_SET } from "./states";

let t: Awaited<ReturnType<typeof testDatabase>>;
let parent: string;
const child = DEV_IDS.musa;

/** Puts the child in a state the way it's stored: no row at all for "missing". */
const start = (state: PaymentState) =>
  t.asSystem(async (tx) => {
    await tx.query(`delete from payment_status where player_id = $1`, [child]);
    if (state !== "missing") await tx.query(`insert into payment_status (player_id, state) values ($1, $2::text::payment_state)`, [child, state]);
  });
const now = async () =>
  (await t.asSystem((tx) => tx.query<{ state: string }>(`select ${PAYMENT_OF_PS} as state from players p left join payment_status ps on ps.player_id = p.id where p.id = $1`, [child])))[0].state;

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  parent = await t.signIn(DEV_EMAILS.parent);
});

describe("the payment states", () => {
  it("are the database's, all of them", async () => {
    const rows = await t.asSystem((tx) => tx.query<{ v: string }>(`select unnest(enum_range(null::payment_state))::text as v`));
    expect(rows.map((r) => r.v).sort()).toEqual([...PAYMENT_STATES].sort());
    expect(Object.keys(PAYMENT_TONE).sort()).toEqual([...PAYMENT_STATES].sort());
    expect(isPaymentState("active")).toBe(true);
    expect(isPaymentState("paid")).toBe(false);
    expect(isPaymentState(null)).toBe(false);
  });

  it("a child with no row reads as missing", async () => {
    await start("missing");
    expect(await now()).toBe("missing");
  });

  it("staff never set 'the parent says so'", () => {
    expect(STAFF_CAN_SET).not.toContain("self_reported");
  });
});

describe("the moves match the database", () => {
  for (const from of PAYMENT_STATES) {
    it(`parent says it's set up, from ${from}`, async () => {
      await start(from);
      await t.asUser(parent, (tx) => tx.query(`select report_payment_setup($1)`, [child]));
      expect(await now()).toBe(PAYMENT_MOVES.parentSaysSetUp(from));
    });

    it(`parent chooses pay as you go, from ${from}`, async () => {
      await start(from);
      await t.asUser(parent, (tx) => tx.query(`select report_pay_as_you_go($1)`, [child]));
      expect(await now()).toBe(PAYMENT_MOVES.parentChoosesPayAsYouGo(from));
    });
  }

  it("a TeamFeePay file: active and overdue as it says; cancelled clears a monthly plan but not pay as you go", () => {
    for (const from of PAYMENT_STATES) {
      expect(PAYMENT_MOVES.teamFeePay(from, "active")).toBe("active");
      expect(PAYMENT_MOVES.teamFeePay(from, "overdue")).toBe("overdue");
    }
    expect(PAYMENT_MOVES.teamFeePay("active", "cancelled")).toBe("missing");
    expect(PAYMENT_MOVES.teamFeePay("self_reported", "cancelled")).toBe("missing");
    expect(PAYMENT_MOVES.teamFeePay("overdue", "cancelled")).toBe("missing");
    expect(PAYMENT_MOVES.teamFeePay("pay_as_you_go", "cancelled")).toBe("pay_as_you_go");
    expect(PAYMENT_MOVES.teamFeePay("missing", "cancelled")).toBe("missing");
  });
});
