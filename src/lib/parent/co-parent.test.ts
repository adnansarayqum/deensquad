// A parent adding the other parent to their own children (migration 0029's add_my_co_parent), run as different
// signed-in people on PGlite with the sample club.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { addMyChild, addMyCoParent, loadFamilyParents } from "./profile";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // parent of Yusuf (U10) and Musa (U7), with Sara
let other: string; // parent of one U10 child
let otherChild: string;

const add = (user: string, email: string, children: string[], name = "Bilal") =>
  t.asUser(user, (tx) => addMyCoParent(tx, { firstName: name, lastName: "Sample", email, phone: null, children }));

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  other = await t.signIn("parent1@example.com");
  [{ id: otherChild }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `select p.id from players p join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id where g.email = 'parent1@example.com'`,
    ),
  );
});

describe("add_my_co_parent", () => {
  it("adds a new parent to the chosen children only, and records who added them", async () => {
    const result = await add(adnan, " Grandad.Sample@Example.com ", [DEV_IDS.yusuf], "Grandad");
    expect(result.created).toBe(true);
    expect(result.linked).toBe(1);
    const rows = await t.asSystem((tx) =>
      tx.query<{ player_id: string; email: string; added_by_guardian: string | null; added: boolean }>(
        `select pg.player_id, g.email, pg.added_by_guardian, pg.added_at is not null as added
         from player_guardians pg join guardians g on g.id = pg.guardian_id where g.id = $1`,
        [result.guardianId],
      ),
    );
    expect(rows).toEqual([{ player_id: DEV_IDS.yusuf, email: "grandad.sample@example.com", added_by_guardian: DEV_IDS.adnan, added: true }]);
    // The family list shows him beside Adnan and Sara.
    const parents = await t.asUser(adnan, loadFamilyParents);
    expect(parents.map((p) => [p.firstName, p.you, p.children])).toEqual([
      ["Adnan", true, ["Yusuf", "Musa"]],
      ["Grandad", false, ["Yusuf"]],
      ["Sara", false, ["Yusuf", "Musa"]],
    ]);
  });

  it("links an existing parent by email instead of adding a second row, and says when nothing was new", async () => {
    const again = await add(adnan, "GRANDAD.sample@example.com", [DEV_IDS.yusuf, DEV_IDS.musa], "Someone");
    expect(again.created).toBe(false);
    expect(again.linked).toBe(1);
    const same = await add(adnan, "grandad.sample@example.com", [DEV_IDS.yusuf, DEV_IDS.musa]);
    expect(same.linked).toBe(0);
    const [{ count, first }] = await t.asSystem((tx) =>
      tx.query<{ count: number; first: string }>(`select count(*)::int as count, min(first_name) as first from guardians where lower(email) = 'grandad.sample@example.com'`),
    );
    expect(count).toBe(1);
    // The name the club has is kept.
    expect(first).toBe("Grandad");
  });

  it("refuses someone else's child, the caller's own email, bad input and staff without children", async () => {
    await expect(add(adnan, "x.sample@example.com", [otherChild])).rejects.toThrow(/not allowed/);
    await expect(add(adnan, "x.sample@example.com", [DEV_IDS.yusuf, otherChild])).rejects.toThrow(/not allowed/);
    await expect(add(other, "x.sample@example.com", [DEV_IDS.musa])).rejects.toThrow(/not allowed/);
    await expect(add(adnan, DEV_EMAILS.parent.toUpperCase(), [DEV_IDS.yusuf])).rejects.toThrow(/own email/);
    await expect(add(adnan, "not an email", [DEV_IDS.yusuf])).rejects.toThrow(/invalid email/);
    await expect(add(adnan, "x.sample@example.com", [DEV_IDS.yusuf], "  ")).rejects.toThrow(/invalid name/);
    await expect(add(adnan, "x.sample@example.com", [])).rejects.toThrow(/no children/);
    const admin = await t.signIn(DEV_EMAILS.admin);
    await expect(add(admin, "x.sample@example.com", [DEV_IDS.yusuf])).rejects.toThrow(/not allowed/);
    // Nothing was written by any of those.
    const [{ count }] = await t.asSystem((tx) => tx.query<{ count: number }>(`select count(*)::int as count from guardians where email = 'x.sample@example.com'`));
    expect(count).toBe(0);
  });

  it("caps a child at 4 parents, and a parent at 5 new parents in a day", async () => {
    // Yusuf has Adnan, Sara and Grandad: one more fits, a fifth doesn't (and nothing of that call is kept).
    await add(adnan, "aunt.sample@example.com", [DEV_IDS.yusuf]);
    await expect(add(adnan, "uncle.sample@example.com", [DEV_IDS.musa, DEV_IDS.yusuf])).rejects.toThrow(/too many parents/);
    const [{ count }] = await t.asSystem((tx) => tx.query<{ count: number }>(`select count(*)::int as count from guardians where email = 'uncle.sample@example.com'`));
    expect(count).toBe(0);
    // Adnan has added two parents today (Grandad and the aunt). Three more, each to a new child of his, reach five; a
    // sixth is refused.
    const kids: string[] = [];
    for (const name of ["Ali", "Isa", "Nuh", "Hud"]) {
      kids.push(await t.asUser(adnan, (tx) => addMyChild(tx, { firstName: name, lastName: "Sample", dateOfBirth: "2018-01-01", ageGroup: "U10" })));
    }
    for (const [i, email] of ["c1.sample@example.com", "c2.sample@example.com", "c3.sample@example.com"].entries()) await add(adnan, email, [kids[i]]);
    await expect(add(adnan, "c4.sample@example.com", [kids[3]])).rejects.toThrow(/too many today/);
  });
});
