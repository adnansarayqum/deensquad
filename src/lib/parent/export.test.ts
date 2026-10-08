import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { buildFamilyExport } from "./export";
import { EXPORT_LIMIT, EXPORT_WINDOW_MS, allowExport, resetExportLimit } from "./export-limit";

let t: Awaited<ReturnType<typeof testDatabase>>;
const now = new Date();

beforeEach(async () => {
  t = await testDatabase({ seed: true, now });
});

/** Every first name of a child at the club who isn't in `family`. */
async function otherChildren(family: string[]): Promise<string[]> {
  const rows = await t.asSystem((tx) => tx.query<{ first_name: string }>(`select distinct first_name from players`));
  return rows.map((r) => r.first_name).filter((n) => !family.includes(n));
}

describe("download my data", () => {
  it("holds the parent's own details and their children's records, and nothing about other families or the other parent", async () => {
    const adnan = await t.signIn(DEV_EMAILS.parent);
    const data = await t.asUser(adnan, (tx) => buildFamilyExport(tx, now));

    expect(data.you).toMatchObject({ firstName: "Adnan", lastName: "Sample", email: DEV_EMAILS.parent });
    expect(data.children.map((c) => c.firstName).sort()).toEqual(["Musa", "Yusuf"]);
    const yusuf = data.children.find((c) => c.firstName === "Yusuf")!;
    expect(yusuf).toMatchObject({ dateOfBirth: "2018-03-14", ageGroup: "U10", photoConsent: "yes", payment: "active", yourRelationship: "father" });
    expect(yusuf.emergencyContacts).toEqual([expect.objectContaining({ name: "Aunt Hafsa", phone: "07700 900099" })]);
    expect(yusuf.badges.length).toBeGreaterThan(0);
    expect(yusuf.coachNotes.length).toBeGreaterThan(0);
    expect(data.newsRead.length).toBe(2);

    const text = JSON.stringify(data);
    for (const name of await otherChildren(["Yusuf", "Musa"])) expect(text).not.toContain(`"${name}"`);
    // Sara's own contact details are hers, not part of Adnan's download.
    expect(text).not.toContain(DEV_EMAILS.secondParent);
    expect(text).not.toContain("07700 900002");
  });

  it("gives a parent who is also an admin only their own family, never the club", async () => {
    // The admin is also the parent of a child of their own.
    await t.asSystem((tx) =>
      tx.query(
        `with g as (insert into guardians (first_name, last_name, email) values ('Imran', 'Khan', $1) returning id),
         p as (insert into players (first_name, last_name, age_group) values ('Zara', 'Khan', 'U7') returning id)
         insert into player_guardians (player_id, guardian_id, relationship) select p.id, g.id, 'father' from p, g`,
        [DEV_EMAILS.admin],
      ),
    );
    const [{ id: zara }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where first_name = 'Zara'`));
    const [{ id: session }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`select id from sessions where starts_at < now() and 'U7' = any (age_groups::text[]) order by starts_at desc limit 1`),
    );
    await t.asSystem(async (tx) => {
      await tx.query(`insert into attendance (session_id, player_id) values ($1, $2)`, [session, zara]);
      await tx.query(`insert into emergency_contacts (player_id, name, phone) values ($1, 'Uncle Bilal', '07700 900555')`, [zara]);
      await tx.query(`insert into player_awards (player_id, points, reason) values ($1, 5, 'Hard work')`, [zara]);
    });
    const staffParent = await t.signIn(DEV_EMAILS.admin);
    const data = await t.asUser(staffParent, (tx) => buildFamilyExport(tx, now));

    expect(data.children.map((c) => c.firstName)).toEqual(["Zara"]);
    expect(data.children[0].attendance).toHaveLength(1);
    expect(data.children[0].emergencyContacts.map((c) => c.name)).toEqual(["Uncle Bilal"]);
    expect(data.children[0].awards.map((a) => a.points)).toEqual([5]);
    expect(data.newsRead).toEqual([]);
    expect(data.shopOrders).toEqual([]);
    const text = JSON.stringify(data);
    for (const name of await otherChildren(["Zara"])) expect(text).not.toContain(`"${name}"`);
    expect(text).not.toContain("Aunt Hafsa");
    expect(text).not.toContain(DEV_EMAILS.parent);
  });

  it("lists the parent's own shop orders with what was ordered for which child", async () => {
    const adnan = await t.signIn(DEV_EMAILS.parent);
    const [{ id: product }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from shop_products where active and cardinality(sizes) = 0 limit 1`));
    await t.asUser(adnan, (tx) => tx.query(`select place_order($1::text::jsonb, 'bank')`, [JSON.stringify([{ product, player: DEV_IDS.musa, quantity: 1 }])]));
    const mine = await t.asUser(adnan, (tx) => buildFamilyExport(tx, now));
    expect(mine.shopOrders).toHaveLength(1);
    expect(mine.shopOrders[0]).toMatchObject({ payBy: "bank", status: "awaiting_payment", reference: expect.stringMatching(/^DS-/) });
    expect(mine.shopOrders[0].items).toEqual([expect.objectContaining({ forChild: "Musa", quantity: 1 })]);
    // Sara shares the children but didn't place the order.
    const sara = await t.signIn(DEV_EMAILS.secondParent);
    expect((await t.asUser(sara, (tx) => buildFamilyExport(tx, now))).shopOrders).toEqual([]);
  });

  it("allows 10 downloads an hour per person", () => {
    resetExportLimit();
    for (let i = 0; i < EXPORT_LIMIT; i++) expect(allowExport("a", 1000)).toBe(true);
    expect(allowExport("a", 1000)).toBe(false);
    expect(allowExport("b", 1000)).toBe(true);
    expect(allowExport("a", 1000 + EXPORT_WINDOW_MS)).toBe(true);
  });
});
