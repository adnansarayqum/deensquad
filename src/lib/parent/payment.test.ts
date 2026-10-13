// Pay as you go (migration 0030's report_pay_as_you_go), run as different signed-in people on PGlite with the sample club.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { reportFamilyPayAsYouGo, reportFamilyPayment } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // parent of Yusuf (plan active in the seed) and Musa (no plan)
let other: string;

const state = async (player: string) =>
  (await t.asSystem((tx) => tx.query<{ state: string }>(`select coalesce((select state::text from payment_status where player_id = $1), 'missing') as state`, [player])))[0].state;

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  other = await t.signIn("parent1@example.com");
});

describe("pay as you go", () => {
  it("is set only for the parent's own children with no plan; an active plan stays", async () => {
    expect(await t.asUser(adnan, (tx) => reportFamilyPayAsYouGo(tx, [DEV_IDS.yusuf, DEV_IDS.musa]))).toEqual([DEV_IDS.musa]);
    expect(await state(DEV_IDS.musa)).toBe("pay_as_you_go");
    expect(await state(DEV_IDS.yusuf)).toBe("active");
  });

  it("never reaches another family's child, even straight through the function", async () => {
    expect(await t.asUser(other, (tx) => reportFamilyPayAsYouGo(tx, [DEV_IDS.yusuf]))).toEqual([]);
    await expect(t.asUser(other, (tx) => tx.query(`select report_pay_as_you_go($1)`, [DEV_IDS.musa]))).rejects.toThrow(/not allowed/);
  });

  it("leaves an overdue plan for the club", async () => {
    await t.asSystem((tx) => tx.query(`update payment_status set state = 'overdue' where player_id = $1`, [DEV_IDS.yusuf]));
    await t.asUser(adnan, (tx) => tx.query(`select report_pay_as_you_go($1)`, [DEV_IDS.yusuf]));
    expect(await state(DEV_IDS.yusuf)).toBe("overdue");
  });

  it("can move to the monthly plan later: \"I've set it up\" covers a pay-as-you-go child", async () => {
    expect(await t.asUser(adnan, (tx) => reportFamilyPayment(tx, [DEV_IDS.musa]))).toEqual([DEV_IDS.musa]);
    expect(await state(DEV_IDS.musa)).toBe("self_reported");
  });
});
