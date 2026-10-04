// Runs the real migrations in an in-memory Postgres (PGlite) with the sample club,
// then checks the row level security rules as different signed-in people.
import { beforeAll, describe, expect, it } from "vitest";
import { DEV_EMAILS, DEV_IDS } from "@/lib/db/dev-seed";
import { testDatabase } from "../test/db";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string; // parent of Yusuf (U10) and Musa (U7)
let sara: string; // their other parent
let other: string; // parent of one U10 child
let coach: string;
let admin: string;
let otherChild: string;

const names = (rows: { first_name: string }[]) => rows.map((r) => r.first_name).sort();

beforeAll(async () => {
  t = await testDatabase({ seed: true });
  adnan = await t.signIn(DEV_EMAILS.parent);
  sara = await t.signIn(DEV_EMAILS.secondParent);
  other = await t.signIn("parent1@example.com");
  coach = await t.signIn(DEV_EMAILS.coach);
  admin = await t.signIn(DEV_EMAILS.admin);
  [{ id: otherChild }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(
      `select p.id from players p join player_guardians pg on pg.player_id = p.id join guardians g on g.id = pg.guardian_id where g.email = 'parent1@example.com'`,
    ),
  );
});

describe("families", () => {
  it("shows a parent all of their children and nobody else's", async () => {
    const rows = await t.asUser(adnan, (tx) => tx.query<{ first_name: string }>("select first_name from players"));
    expect(names(rows)).toEqual(["Musa", "Yusuf"]);
  });

  it("shows the second parent the same children", async () => {
    const rows = await t.asUser(sara, (tx) => tx.query<{ first_name: string }>("select first_name from players"));
    expect(names(rows)).toEqual(["Musa", "Yusuf"]);
  });

  it("lets parents see each other but not other families", async () => {
    const rows = await t.asUser(adnan, (tx) => tx.query<{ first_name: string }>("select first_name from guardians"));
    expect(names(rows)).toEqual(["Adnan", "Sara"]);
  });

  it("shows sessions and news for every age group in the family", async () => {
    const news = await t.asUser(adnan, (tx) => tx.query<{ title: string }>("select title from announcements"));
    expect(news).toHaveLength(3); // U10 kit message + two for everyone
    const u7Only = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`insert into announcements (topic, title, body, audience) values ('Kit', 'U7 bibs', 'x', '{U7}') returning id`),
    );
    const otherSees = await t.asUser(other, (tx) => tx.query("select 1 from announcements where id = $1", [u7Only[0].id]));
    const adnanSees = await t.asUser(adnan, (tx) => tx.query("select 1 from announcements where id = $1", [u7Only[0].id]));
    expect(otherSees).toHaveLength(0);
    expect(adnanSees).toHaveLength(1);
  });
});

describe("parent writes", () => {
  it("answers availability for their own child only", async () => {
    const [session] = await t.asUser(adnan, (tx) => tx.query<{ id: string }>("select id from sessions where starts_at > now() order by starts_at limit 1"));
    await t.asUser(adnan, (tx) =>
      tx.query("insert into availability (session_id, player_id, answer) values ($1, $2, 'coming')", [session.id, DEV_IDS.musa]),
    );
    await expect(
      t.asUser(adnan, (tx) => tx.query("insert into availability (session_id, player_id, answer) values ($1, $2, 'away')", [session.id, otherChild])),
    ).rejects.toThrow(/row-level security/);
  });

  it("acknowledges news only as themselves", async () => {
    const [ann] = await t.asSystem((tx) => tx.query<{ id: string }>("select id from announcements where title like 'New away kit%'"));
    await t.asUser(adnan, (tx) => tx.query("insert into announcement_reads (announcement_id, guardian_id) values ($1, $2)", [ann.id, DEV_IDS.adnan]));
    await expect(
      t.asUser(adnan, (tx) => tx.query("insert into announcement_reads (announcement_id, guardian_id) values ($1, $2)", [ann.id, DEV_IDS.sara])),
    ).rejects.toThrow(/row-level security/);
  });

  it("records photo consent through the function, for their own child only", async () => {
    await t.asUser(sara, (tx) => tx.query("select set_photo_consent($1, false)", [DEV_IDS.musa]));
    const [musa] = await t.asSystem((tx) => tx.query<{ photo_consent: boolean }>("select photo_consent from players where id = $1", [DEV_IDS.musa]));
    expect(musa.photo_consent).toBe(false);
    await expect(t.asUser(adnan, (tx) => tx.query("select set_photo_consent($1, true)", [otherChild]))).rejects.toThrow(/not allowed/);
    await expect(t.asUser(adnan, (tx) => tx.query("update players set shirt_number = 99 where id = $1", [DEV_IDS.yusuf]))).resolves.toEqual([]);
    const [yusuf] = await t.asSystem((tx) => tx.query<{ shirt_number: number }>("select shirt_number from players where id = $1", [DEV_IDS.yusuf]));
    expect(yusuf.shirt_number).toBe(7);
  });

  it("reports payment set-up without overriding a plan the club has confirmed", async () => {
    await t.asUser(adnan, (tx) => tx.query("select report_payment_setup($1)", [DEV_IDS.musa]));
    await t.asUser(adnan, (tx) => tx.query("select report_payment_setup($1)", [DEV_IDS.yusuf]));
    const rows = await t.asSystem((tx) =>
      tx.query<{ player_id: string; state: string }>("select player_id, state::text from payment_status where player_id = any($1::uuid[])", [[DEV_IDS.musa, DEV_IDS.yusuf]]),
    );
    expect(Object.fromEntries(rows.map((r) => [r.player_id, r.state]))).toEqual({ [DEV_IDS.musa]: "self_reported", [DEV_IDS.yusuf]: "active" });
  });

  it("can't write to staff-only tables", async () => {
    await expect(t.asUser(adnan, (tx) => tx.query("insert into announcements (topic, title, body) values ('x', 'y', 'z')"))).rejects.toThrow(
      /row-level security/,
    );
    await expect(t.asUser(adnan, (tx) => tx.query("select * from announcement_chases"))).resolves.toEqual([]);
    await expect(t.asUser(adnan, (tx) => tx.query("select * from auth.sessions"))).rejects.toThrow(/permission denied/);
  });
});

describe("squad headcount", () => {
  it("gives parents numbers for their child's group only", async () => {
    const [session] = await t.asSystem((tx) =>
      tx.query<{ id: string }>("select id from sessions where kind = 'training' and starts_at > now() order by starts_at limit 1"),
    );
    const [u9] = await t.asUser(adnan, (tx) => tx.query<{ coming: number; away: number; squad: number }>("select * from squad_counts($1, 'U10')", [session.id]));
    expect(u9).toEqual({ coming: 11, away: 2, squad: 16 });
    const [u12] = await t.asUser(adnan, (tx) => tx.query<{ squad: number }>("select squad from squad_counts($1, 'U12')", [session.id]));
    expect(u12.squad).toBe(0);
  });
});

describe("staff", () => {
  it("gives coaches the whole club and the gaps view", async () => {
    const players = await t.asUser(coach, (tx) => tx.query("select id from players"));
    expect(players.length).toBe(21);
    const gaps = await t.asUser(coach, (tx) =>
      tx.query<{ first_name: string; payment: string; in_app: boolean }>(
        "select first_name, payment::text, in_app from family_gaps where first_name in ('Yusuf', 'Ibrahim') order by first_name",
      ),
    );
    expect(gaps).toEqual([
      { first_name: "Ibrahim", payment: "missing", in_app: false },
      { first_name: "Yusuf", payment: "active", in_app: true },
    ]);
  });

  it("lets only admins add staff", async () => {
    await expect(
      t.asUser(coach, (tx) => tx.query("insert into staff (email, display_name, role) values ('new@deensquad.test', 'New', 'coach')")),
    ).rejects.toThrow(/row-level security/);
    await t.asUser(admin, (tx) => tx.query("insert into staff (email, display_name, role) values ('new@deensquad.test', 'New', 'coach')"));
    const staff = await t.asUser(coach, (tx) => tx.query("select email from staff"));
    expect(staff).toHaveLength(3);
  });
});
