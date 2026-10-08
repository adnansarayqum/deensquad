import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { buildCalendar, type CalendarSession } from "./ics";
import { googleCalendarUrl, loadCalendarSession, sessionIcsFilename, sessionIcsPath } from "./session";

const event = (over: Partial<CalendarSession> = {}): CalendarSession => ({
  id: "5f0c1a7e-0000-4000-8000-000000000001",
  title: "Training",
  // 6:30pm–8pm London in BST (UTC+1) and in GMT.
  startsAt: new Date("2026-10-09T17:30:00Z"),
  endsAt: new Date("2026-10-09T19:00:00Z"),
  venue: "Bobby Moore Sports Hub, Ilford",
  children: ["Yusuf"],
  arriveBy: "6:20pm",
  kit: "Green top & shin pads",
  notes: null,
  cancelled: false,
  cancelReason: null,
  ...over,
});

describe("Google Calendar link", () => {
  it("fills in Google's event page with UTC times, the venue and the briefing, every value escaped", () => {
    const url = new URL(googleCalendarUrl(event({ children: ["Musa", "Yusuf"] })));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Training (Musa and Yusuf)");
    expect(url.searchParams.get("dates")).toBe("20261009T173000Z/20261009T190000Z");
    expect(url.searchParams.get("location")).toBe("Bobby Moore Sports Hub, Ilford");
    expect(url.searchParams.get("details")).toBe("Arrive by: 6:20pm\nKit: Green top & shin pads");
    // Escaped: nothing a venue or note holds can add or break a parameter.
    const raw = googleCalendarUrl(event());
    expect(raw).toContain("details=Arrive%20by%3A%206%3A20pm%0AKit%3A%20Green%20top%20%26%20shin%20pads");
    expect(raw).not.toMatch(/[ \n]/);
  });

  it("is in UTC in winter too, and leaves out empty details", () => {
    const url = new URL(googleCalendarUrl(event({ startsAt: new Date("2026-12-04T18:30:00Z"), endsAt: new Date("2026-12-04T20:00:00Z"), arriveBy: null, kit: null })));
    expect(url.searchParams.get("dates")).toBe("20261204T183000Z/20261204T200000Z");
    expect(url.searchParams.has("details")).toBe(false);
  });

  it("names the file by the session's London day", () => {
    expect(sessionIcsFilename(new Date("2026-10-09T23:30:00Z"))).toBe("deen-squad-2026-10-10.ics");
    expect(sessionIcsPath("abc")).toBe("/api/sessions/abc/ics");
  });
});

describe("one session as a calendar file", () => {
  let t: Awaited<ReturnType<typeof testDatabase>>;
  let ids: Record<string, string>;
  let amina: string;
  let omar: string;
  let coach: string;

  beforeAll(async () => {
    t = await testDatabase();
    ids = await t.asSystem(async (tx) => {
      const one = async (sql: string, params: unknown[] = []) => (await tx.query<{ id: string }>(sql, params))[0].id;
      const aminaG = await one(`insert into guardians (first_name, last_name, email) values ('Amina', 'Khan', 'amina@example.com') returning id`);
      const omarG = await one(`insert into guardians (first_name, last_name, email) values ('Omar', 'Ali', 'omar@example.com') returning id`);
      const yusuf = await one(`insert into players (first_name, last_name, age_group) values ('Yusuf', 'Khan', 'U10') returning id`);
      const musa = await one(`insert into players (first_name, last_name, age_group) values ('Musa', 'Khan', 'U7') returning id`);
      const bilal = await one(`insert into players (first_name, last_name, age_group) values ('Bilal', 'Ali', 'U12') returning id`);
      const zayd = await one(`insert into players (first_name, last_name, age_group) values ('Zayd', 'Other', 'U10') returning id`);
      await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $3), ($2, $3), ($4, $5)`, [yusuf, musa, aminaG, bilal, omarG]);
      await tx.query(`insert into staff (email, display_name, role) values ('coach@example.com', 'Coach', 'coach')`);
      const session = (title: string, groups: string) =>
        one(
          `insert into sessions (title, starts_at, ends_at, venue, age_groups) values ($1, '2026-10-09T17:30:00Z', '2026-10-09T19:00:00Z', 'Hub', $2::age_group[]) returning id`,
          [title, groups],
        );
      const joint = await session("Friday training", "{U7,U10}");
      const u12 = await session("U12 training", "{U12}");
      const cup = await session("U10 cup", "{U10}");
      await tx.query(`insert into session_squads (session_id, player_id) values ($1, $2)`, [cup, zayd]); // Yusuf not picked
      return { joint, u12, cup };
    });
    amina = await t.signIn("amina@example.com");
    omar = await t.signIn("omar@example.com");
    coach = await t.signIn("coach@example.com");
  });

  it("gives a parent their own children's session, named with them, with the feed's UID", async () => {
    const s = (await t.asUser(amina, (tx) => loadCalendarSession(tx, ids.joint, false)))!;
    expect(s.children).toEqual(["Musa", "Yusuf"]);
    const ics = buildCalendar([s], new Date("2026-10-08T12:00:00Z"));
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain(`UID:${ids.joint}@thedeensquadfootballacademy.co.uk`);
    expect(ics).toContain("SUMMARY:Friday training (Musa and Yusuf)");
    expect(ics).not.toContain("Khan");
  });

  it("gives another family nothing: not their group, or a squad their child isn't picked for", async () => {
    expect(await t.asUser(omar, (tx) => loadCalendarSession(tx, ids.joint, false))).toBeNull();
    expect(await t.asUser(amina, (tx) => loadCalendarSession(tx, ids.u12, false))).toBeNull();
    expect(await t.asUser(amina, (tx) => loadCalendarSession(tx, ids.cup, false))).toBeNull();
    expect(await t.asUser(amina, (tx) => loadCalendarSession(tx, "00000000-0000-4000-8000-000000000000", false))).toBeNull();
  });

  it("gives staff any session, without anyone's children", async () => {
    const s = (await t.asUser(coach, (tx) => loadCalendarSession(tx, ids.u12, true)))!;
    expect([s.title, s.children]).toEqual(["U12 training", []]);
  });
});
