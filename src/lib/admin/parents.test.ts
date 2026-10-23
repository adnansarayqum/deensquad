// The Parents not on the app list holds exactly the parents the overview's "N not yet" counts, including a second
// parent whose partner has signed in (who never showed on the Families list, which goes by child).
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { loadDashboard } from "./dashboard";
import { loadParentsNotIn } from "./parents";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: new Date("2031-10-15T12:00:00Z") });
  admin = await t.signIn(DEV_EMAILS.admin);
  await t.signIn(DEV_EMAILS.parent); // Yusuf's parent, on the app
});

describe("parents not on the app", () => {
  it("lists as many parents as the overview's 'not yet', a signed-in family's second parent included", async () => {
    // Yusuf's family is in; add a second parent who hasn't signed in.
    await t.asSystem(async (tx) => {
      const [{ id }] = await tx.query<{ id: string }>(
        `insert into guardians (first_name, last_name, email, invited_at) values ('Second', 'Parent', 'second@example.com', now()) returning id`,
      );
      await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [DEV_IDS.yusuf, id]);
    });
    const now = new Date("2031-10-15T12:00:00Z");
    const [list, dash] = await t.asUser(admin, async (tx) => [
      await loadParentsNotIn(tx, null),
      await loadDashboard(tx, { now, limit: null, withShop: false, withRequests: false }),
    ] as const);
    expect(list.length).toBe(dash.families.parents - dash.families.signedIn);
    const second = list.find((p) => p.email === "second@example.com")!;
    expect(second.invitedAt).not.toBeNull();
    expect(second.children.map((c) => c.id)).toContain(DEV_IDS.yusuf);
    // Yusuf's signed-in parent is named, so staff can see the family is already reachable.
    expect(second.partnersOnApp.length).toBeGreaterThan(0);
  });

  it("keeps a group coach to their own groups", async () => {
    const list = await t.asUser(admin, (tx) => loadParentsNotIn(tx, ["U12"]));
    expect(list.every((p) => p.children.every((c) => c.group === "U12"))).toBe(true);
  });
});
