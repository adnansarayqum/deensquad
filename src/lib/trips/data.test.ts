// Away trips on the database: staff add the details, a parent answers only for their own child on a trip that's for
// that child and hasn't started; the trip page lists who's cleared; other families and other groups' coaches see nothing.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../../../test/db";
import { giveTripConsent, loadFamilyTrips, loadTripPage, saveTrip } from "./data";

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let parent: string;
let cup: string;
let adminStaff: string;
const NOW = new Date("2026-10-27T12:00:00Z");

beforeAll(async () => {
  t = await testDatabase({ seed: true, now: NOW });
  admin = await t.signIn(DEV_EMAILS.admin);
  parent = await t.signIn(DEV_EMAILS.parent);
  [{ id: cup }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where title = 'Autumn Cup'`));
  [{ id: adminStaff }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
});

describe("away trips", () => {
  it("staff add the trip; the family of a child it's for sees it, waiting for an answer", async () => {
    const [s] = await t.asSystem((tx) => tx.query<{ starts_at: Date }>(`select starts_at from sessions where id = $1`, [cup]));
    await t.asUser(admin, (tx) =>
      saveTrip(tx, cup, { meetAt: new Date(new Date(s.starts_at).getTime() - 90 * 60_000), meetPoint: "Hub car park", returnAt: null, transport: "Minibus", costPence: 500, notes: null }, adminStaff),
    );
    const trips = await t.asUser(parent, (tx) => loadFamilyTrips(tx, [DEV_IDS.yusuf, DEV_IDS.musa], NOW));
    expect(trips).toHaveLength(1);
    // Yusuf (U10) is in the cup's groups; Musa (U7) isn't, so he isn't asked.
    expect(trips[0].children.map((c) => [c.id, c.answer])).toEqual([[DEV_IDS.yusuf, null]]);
    expect(trips[0].trip).toMatchObject({ meetPoint: "Hub car park", transport: "Minibus", costPence: 500 });
  });

  it("a parent answers for their own child, and only for a child the trip is for", async () => {
    await t.asUser(parent, (tx) => giveTripConsent(tx, cup, DEV_IDS.yusuf, true, "07700 900111", "Travel sick"));
    await expect(t.asUser(parent, (tx) => giveTripConsent(tx, cup, DEV_IDS.musa, true, "07700 900111", null))).rejects.toThrow(/trip not open/);
    const [other] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where id <> all($1::uuid[]) and age_group = 'U10' limit 1`, [[DEV_IDS.yusuf, DEV_IDS.musa]]));
    await expect(t.asUser(parent, (tx) => giveTripConsent(tx, cup, other.id, true, null, null))).rejects.toThrow(/not your child/);
    // Changing the answer overwrites it.
    await t.asUser(parent, (tx) => giveTripConsent(tx, cup, DEV_IDS.yusuf, true, "07700 900222", null));
    const [trip] = await t.asUser(parent, (tx) => loadFamilyTrips(tx, [DEV_IDS.yusuf], NOW));
    expect(trip.children[0].answer).toMatchObject({ consent: true, dayPhone: "07700 900222", note: null });
  });

  it("lists who's cleared on the staff trip page, and refuses a coach whose groups don't cover the session", async () => {
    const page = await t.asUser(admin, (tx) => loadTripPage(tx, cup, null));
    const yusuf = page!.roster.find((c) => c.id === DEV_IDS.yusuf)!;
    expect(yusuf.answer).toMatchObject({ consent: true, dayPhone: "07700 900222" });
    expect(page!.roster.every((c) => c.group !== "U7")).toBe(true);
    expect(await t.asUser(admin, (tx) => loadTripPage(tx, cup, ["U10"]))).toBeNull();
  });

  it("closes once the session has started, and families of other groups can't read it", async () => {
    await t.asSystem((tx) => tx.query(`update sessions set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour' where id = $1`, [cup]));
    await expect(t.asUser(parent, (tx) => giveTripConsent(tx, cup, DEV_IDS.yusuf, false, null, null))).rejects.toThrow(/trip not open/);
    const u7Parent = await t.asSystem((tx) =>
      tx.query<{ email: string }>(`select g.email from guardians g join player_guardians pg on pg.guardian_id = g.id join players p on p.id = pg.player_id where p.age_group = 'U7' and p.id <> $1 limit 1`, [DEV_IDS.musa]),
    );
    const other = await t.signIn(u7Parent[0].email);
    expect(await t.asUser(other, (tx) => tx.query(`select * from session_trips`))).toEqual([]);
    expect(await t.asUser(other, (tx) => tx.query(`select * from trip_consents`))).toEqual([]);
  });
});
