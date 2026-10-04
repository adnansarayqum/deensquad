import { addDays, londonDate, londonTime, nextFridaySession } from "../dates";
import type { Queryable } from "./types";

// Sample club for local development and end-to-end tests only. Never runs on Railway.
// One family has two children (Yusuf, U9 and Musa, U7) and two parents, so the multi-child
// screens are exercised. All names are invented; emails use reserved test domains and
// phone numbers come from Ofcom's range for drama (07700 900xxx).

export const DEV_IDS = {
  adnan: "10000000-0000-4000-8000-000000000001",
  sara: "10000000-0000-4000-8000-000000000002",
  yusuf: "20000000-0000-4000-8000-000000000001",
  musa: "20000000-0000-4000-8000-000000000002",
} as const;

export const DEV_EMAILS = {
  parent: "adnan@example.com",
  secondParent: "sara@example.com",
  admin: "admin@deensquad.test",
  coach: "coach@deensquad.test",
} as const;

const U9 = ["Ahmed K", "Bilal R", "Hamza T", "Idris H", "Yahya B", "Ismail N", "Ayaan P", "Zakariya O", "Harun Q", "Rayyan J", "Sulaiman W", "Adam F", "Ilyas C", "Ibrahim M", "Zayd A"];
const U7 = ["Nuh E", "Isa G", "Dawud L", "Yunus V"];

export async function seedDev(tx: Queryable, now = new Date()): Promise<void> {
  const one = async (text: string, params: unknown[]) => (await tx.query<{ id: string }>(text, params))[0]?.id;

  await tx.query(
    `insert into staff (email, display_name, role) values ($1, 'Ibrahim Khan', 'admin'), ($2, 'Coach Hamza', 'coach')`,
    [DEV_EMAILS.admin, DEV_EMAILS.coach],
  );
  const coachStaffId = await one(`select id from staff where email = $1`, [DEV_EMAILS.coach]);

  // The two-parent, two-child family.
  await tx.query(
    `insert into guardians (id, first_name, last_name, email, phone) values
       ($1, 'Adnan', 'Sample', $3, '07700 900001'),
       ($2, 'Sara', 'Sample', $4, '07700 900002')`,
    [DEV_IDS.adnan, DEV_IDS.sara, DEV_EMAILS.parent, DEV_EMAILS.secondParent],
  );
  await tx.query(
    `insert into players (id, first_name, last_name, date_of_birth, shirt_number, age_group, position, joined_on, photo_consent, photo_consent_recorded_at) values
       ($1, 'Yusuf', 'Sample', '2018-03-14', 7, 'U9', 'Midfielder', '2026-09-05', true, now()),
       ($2, 'Musa', 'Sample', '2020-06-02', 3, 'U7', null, '2026-09-05', null, null)`,
    [DEV_IDS.yusuf, DEV_IDS.musa],
  );
  for (const player of [DEV_IDS.yusuf, DEV_IDS.musa]) {
    await tx.query(`insert into player_guardians (player_id, guardian_id, relationship) values ($1, $2, 'father'), ($1, $3, 'mother')`, [
      player,
      DEV_IDS.adnan,
      DEV_IDS.sara,
    ]);
  }

  // The rest of the squads, one parent each.
  const squad: { id: string; group: "U9" | "U7" }[] = [];
  const all = [...U9.map((n) => ({ n, group: "U9" as const })), ...U7.map((n) => ({ n, group: "U7" as const }))];
  for (const [i, { n, group }] of all.entries()) {
    const [first, last] = n.split(" ");
    const playerId = await one(
      `insert into players (first_name, last_name, shirt_number, age_group, joined_on) values ($1, $2, $3, $4::age_group, '2026-09-05') returning id`,
      [first, last, (i % 20) + 1 === 7 ? 18 : (i % 20) + 1, group],
    );
    const guardianId = await one(
      `insert into guardians (first_name, last_name, email, phone) values ('Parent', $1, $2, $3) returning id`,
      [last, `parent${i + 1}@example.com`, `07700 9001${String(i).padStart(2, "0")}`],
    );
    await tx.query(`insert into player_guardians (player_id, guardian_id) values ($1, $2)`, [playerId, guardianId]);
    squad.push({ id: playerId!, group });
  }

  // Fridays: six in the past (for stats), the coming one and the one after, plus a cup day.
  const coming = nextFridaySession(now);
  const sessionIds: string[] = [];
  for (let week = -6; week <= 1; week++) {
    const start = addDays(coming.start, week * 7);
    const d = londonDate(start);
    sessionIds.push(
      (await one(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups, arrive_by, kit, prayer_note)
         values ('training', 'Training', $1, $2, 'Bobby Moore Sports Hub', '{U7,U9,U11,U13,U15}', '6:20pm', 'Green top · shin pads · water bottle', 'Prayer break in the session')
         returning id`,
        [londonTime(d.year, d.month, d.day, 18, 30), londonTime(d.year, d.month, d.day, 20, 0)],
      ))!,
    );
  }
  const cup = londonDate(addDays(coming.start, 15));
  await tx.query(
    `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('tournament', 'Autumn Cup', $1, $2, 'Venue to be confirmed', '{U9,U11,U13}')`,
    [londonTime(cup.year, cup.month, cup.day, 10, 0), londonTime(cup.year, cup.month, cup.day, 15, 0)],
  );
  const past = sessionIds.slice(0, 6);
  const thisFriday = sessionIds[6];

  // Yusuf: came to the last four in a row and one earlier. Musa: the last two.
  for (const s of [past[0], past[2], past[3], past[4], past[5]]) {
    await tx.query(`insert into attendance (session_id, player_id) values ($1, $2)`, [s, DEV_IDS.yusuf]);
  }
  for (const s of [past[4], past[5]]) {
    await tx.query(`insert into attendance (session_id, player_id) values ($1, $2)`, [s, DEV_IDS.musa]);
  }
  // Most of the U9s have answered for this Friday.
  for (const [i, p] of squad.filter((s) => s.group === "U9").entries()) {
    if (i < 11) await tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'coming')`, [thisFriday, p.id]);
    else if (i < 13) await tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'away')`, [thisFriday, p.id]);
  }

  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);
  const kit = await one(
    `insert into announcements (topic, title, body, audience, posted_by, posted_at) values ('Kit', 'New away kit: sizes needed by Friday', 'Please reply with your child''s size so we can place the bulk order.', '{U9}', $1, $2) returning id`,
    [coachStaffId, hoursAgo(3)],
  );
  const winter = await one(
    `insert into announcements (topic, title, body, posted_by, posted_at) values ('Timing', 'Winter timings start 7 Nov', 'Sessions stay 6:30–8:00pm. Arrive by 6:20pm and bring a warm layer.', $1, $2) returning id`,
    [coachStaffId, hoursAgo(74)],
  );
  const payments = await one(
    `insert into announcements (topic, title, body, posted_by, posted_at) values ('Payments', 'Monthly plan now live on TeamFeePay', 'Every family sets up the monthly plan once. It takes about two minutes.', $1, $2) returning id`,
    [coachStaffId, hoursAgo(240)],
  );
  void kit;
  await tx.query(`insert into announcement_reads (announcement_id, guardian_id) values ($1, $3), ($2, $3)`, [winter, payments, DEV_IDS.adnan]);

  await tx.query(`insert into payment_status (player_id, state) values ($1, 'active')`, [DEV_IDS.yusuf]);
  await tx.query(`insert into emergency_contacts (player_id, name, phone, relationship) values ($1, 'Aunt Hafsa', '07700 900099', 'Aunt')`, [DEV_IDS.yusuf]);

  await tx.query(
    `insert into badges (id, name, icon) values ('first-goal', 'First goal', 'star'), ('on-time-5', 'On time ×5', 'clock'), ('good-adab', 'Good adab', 'trophy'), ('ten-sessions', '10 sessions', 'target')`,
    [],
  );
  await tx.query(`insert into player_badges (player_id, badge_id, earned_on) values ($1, 'first-goal', $2), ($1, 'good-adab', $3)`, [
    DEV_IDS.yusuf,
    addDays(now, -15).toISOString().slice(0, 10),
    addDays(now, -8).toISOString().slice(0, 10),
  ]);
  await tx.query(`insert into coach_notes (player_id, author, body) values ($1, $2, 'Great passing on Friday, Yusuf. Keep your head up when you receive.')`, [
    DEV_IDS.yusuf,
    coachStaffId,
  ]);
}
