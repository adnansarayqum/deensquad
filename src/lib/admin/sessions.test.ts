import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { runLadder, type ChaseTarget, type Senders } from "../chase/ladder";
import { addDays, londonDate, londonTime, nextFridaySession } from "../dates";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { loadFamily, loadUpcomingSessions, saveAnswer } from "../parent/data";
import { buildWeek } from "../parent/views";
import {
  addSessionRun,
  addedSentence,
  cancelSession,
  editSession,
  lossesSentence,
  postSessionNotice,
  removeSession,
  sessionLosses,
  type NewSessions,
  type SessionEdit,
} from "./sessions";

let t: Awaited<ReturnType<typeof testDatabase>>;
let coach: string;
let admin: string;
let adminStaffId: string;
let cup: string;
let friday: string;
let nextFriday: string;
const now = new Date();
const coming = nextFridaySession(now);

beforeEach(async () => {
  t = await testDatabase({ seed: true, now });
  coach = await t.signIn(DEV_EMAILS.coach);
  admin = await t.signIn(DEV_EMAILS.admin);
  [{ id: adminStaffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  [{ id: cup }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where title = 'Autumn Cup'`));
  [{ id: friday }, { id: nextFriday }] = await t.asSystem((tx) =>
    tx.query<{ id: string }>(`select id from sessions where starts_at in ($1, $2) order by starts_at`, [coming.start, addDays(coming.start, 7)]),
  );
});

const cancelledAt = (id: string) =>
  t.asSystem(async (tx) => (await tx.query<{ cancelled_at: string | null }>(`select cancelled_at::text from sessions where id = $1`, [id]))[0]?.cancelled_at);

describe("a U7 coach changing sessions", () => {
  it("can't cancel or delete the U10/U12/U15 Autumn Cup", async () => {
    expect(await t.asUser(coach, (tx) => cancelSession(tx, cup, true, ["U7"]))).toBe(false);
    expect(await cancelledAt(cup)).toBeNull();
    expect(await t.asUser(coach, (tx) => removeSession(tx, cup, ["U7"]))).toBe(false);
    expect(await cancelledAt(cup)).toBeNull();
  });

  it("can cancel, restore and delete a U7-only session", async () => {
    const [{ id }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('training', 'U7 extra', now() + interval '3 days', now() + interval '3 days 1 hour', 'Hub', '{U7}') returning id`,
      ),
    );
    expect(await t.asUser(coach, (tx) => cancelSession(tx, id, true, ["U7"]))).toBe(true);
    expect(await cancelledAt(id)).not.toBeNull();
    // A double tap or a second tab changes nothing, so no second notice is posted.
    expect(await t.asUser(coach, (tx) => cancelSession(tx, id, true, ["U7"]))).toBe(false);
    expect(await t.asUser(coach, (tx) => cancelSession(tx, id, false, ["U7"]))).toBe(true);
    expect(await t.asUser(coach, (tx) => cancelSession(tx, id, false, ["U7"]))).toBe(false);
    expect(await cancelledAt(id)).toBeNull();
    expect(await t.asUser(coach, (tx) => removeSession(tx, id, ["U7"]))).toBe(true);
    expect(await cancelledAt(id)).toBeUndefined();
  });

  it("deleting a session takes its plans' attached files with it", async () => {
    const [{ id }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('training', 'U7 planned', now() + interval '3 days', now() + interval '3 days 1 hour', 'Hub', '{U7}') returning id`,
      ),
    );
    const [{ id: file }, { id: other }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into club_files (name, mime, size, data) values ('plan.pdf', 'application/pdf', 4, '\x25504446'), ('sheet.pdf', 'application/pdf', 4, '\x25504446') returning id`,
      ),
    );
    await t.asSystem((tx) =>
      tx.query(`insert into session_plans (session_id, age_group, body, file_id, author) values ($1, 'U7', 'Passing', $2, $3)`, [id, file, adminStaffId]),
    );
    expect(await t.asUser(coach, (tx) => removeSession(tx, id, ["U7"]))).toBe(true);
    const left = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from club_files where id in ($1, $2)`, [file, other]));
    expect(left.map((r) => r.id)).toEqual([other]);
  });

  it("with no limit (an admin, or a coach with no groups) can cancel the cup", async () => {
    expect(await t.asUser(coach, (tx) => cancelSession(tx, cup, true, null))).toBe(true);
    expect(await cancelledAt(cup)).not.toBeNull();
  });
});

describe("adding a weekly run", () => {
  const fridays = (weeks: number, hour = 18, minute = 30) =>
    Array.from({ length: weeks }, (_, i) => {
      const d = londonDate(addDays(coming.start, i * 7));
      return { start: londonTime(d.year, d.month, d.day, hour, minute), end: londonTime(d.year, d.month, d.day, 20, 0) };
    });
  const run = (times: NewSessions["times"], groups: NewSessions["groups"] = ["U10"]): NewSessions => ({
    kind: "training",
    title: "Training",
    venue: "Hub",
    groups,
    times,
    arriveBy: null,
    kit: null,
    prayerNote: null,
    notes: null,
  });
  const dayMonth = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(d);

  it("skips dates that already have a session at that time for one of the groups, and says which", async () => {
    // The sample club already has this Friday and next at 6:30pm for every group.
    const result = await t.asUser(admin, (tx) => addSessionRun(tx, run(fridays(3))));
    expect(result.added).toHaveLength(1);
    expect(result.skipped).toHaveLength(2);
    const [first, second] = fridays(3);
    expect(addedSentence(result)).toBe(
      `Added 1 session. Parents can answer straight away. Skipped 2 that already existed (${dayMonth(first.start)}, ${dayMonth(second.start)}).`,
    );
    // Adding the same term again adds nothing.
    const again = await t.asUser(admin, (tx) => addSessionRun(tx, run(fridays(3))));
    expect(again.added).toHaveLength(0);
    expect(addedSentence(again)).toMatch(/^No sessions added\. Skipped 3 that already existed/);
    const [{ n }] = await t.asSystem((tx) => tx.query<{ n: number }>(`select count(*)::int as n from sessions where starts_at = $1`, [first.start]));
    expect(n).toBe(1);
  });

  it("adds a session at another time, or for groups the existing one doesn't cover", async () => {
    expect((await t.asUser(admin, (tx) => addSessionRun(tx, run(fridays(2, 17, 0))))).added).toHaveLength(2);
    const sat = { start: addDays(coming.start, 1), end: addDays(coming.end, 1) };
    expect((await t.asUser(admin, (tx) => addSessionRun(tx, run([sat], ["U7"])))).added).toHaveLength(1);
    expect((await t.asUser(admin, (tx) => addSessionRun(tx, run([sat], ["U10"])))).added).toHaveLength(1);
    expect((await t.asUser(admin, (tx) => addSessionRun(tx, run([sat], ["U7", "U12"])))).skipped).toHaveLength(1);
  });

  it("counts a cancelled session as existing", async () => {
    await t.asUser(admin, (tx) => cancelSession(tx, friday, true, null));
    expect((await t.asUser(admin, (tx) => addSessionRun(tx, run(fridays(1))))).skipped).toHaveLength(1);
  });
});

describe("editing a session", () => {
  const edit = (overrides: Partial<SessionEdit> = {}): SessionEdit => ({
    kind: "tournament",
    title: "Autumn Cup",
    venue: "Goresbrook Leisure Centre",
    groups: ["U10", "U12", "U15"],
    start: addDays(coming.start, 15),
    end: addDays(coming.end, 15),
    arriveBy: "9:30am",
    kit: "Full kit",
    prayerNote: null,
    notes: "Park on Ripple Road. Bring a packed lunch.",
    ...overrides,
  });

  it("saves the details, keeps answers when the time moves, and parents see the notes", async () => {
    await t.asSystem((tx) => tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'coming')`, [cup, DEV_IDS.yusuf]));
    const result = await t.asUser(admin, (tx) => editSession(tx, cup, edit(), null));
    expect(result).toEqual({ ok: true, squadRemoved: 0, squadEmptied: false });
    const parent = await t.signIn(DEV_EMAILS.parent);
    const sessions = await t.asUser(parent, async (tx) => loadUpcomingSessions(tx, (await loadFamily(tx))!.children, now));
    const shown = sessions.find((s) => s.id === cup)!;
    expect(shown).toMatchObject({ venue: "Goresbrook Leisure Centre", notes: "Park on Ripple Road. Bring a packed lunch.", arriveBy: "9:30am" });
    expect(shown.startsAt).toBe(addDays(coming.start, 15).toISOString());
    const [{ n }] = await t.asSystem((tx) => tx.query<{ n: number }>(`select count(*)::int as n from availability where session_id = $1`, [cup]));
    expect(n).toBe(1);
  });

  it("takes children out of the squad (and their answers) when their group comes off", async () => {
    const [{ id: older }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`insert into players (first_name, last_name, age_group) values ('Older', 'Player', 'U12') returning id`),
    );
    await t.asSystem(async (tx) => {
      for (const p of [DEV_IDS.yusuf, older]) {
        await tx.query(`insert into session_squads (session_id, player_id) values ($1, $2)`, [cup, p]);
        await tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'coming')`, [cup, p]);
      }
    });
    expect(await t.asUser(admin, (tx) => editSession(tx, cup, edit({ groups: ["U10"] }), null))).toEqual({ ok: true, squadRemoved: 1, squadEmptied: false });
    const left = await t.asSystem((tx) =>
      tx.query<{ player_id: string }>(`select player_id from session_squads where session_id = $1 union all select player_id from availability where session_id = $1`, [cup]),
    );
    expect(left.map((r) => r.player_id)).toEqual([DEV_IDS.yusuf, DEV_IDS.yusuf]);
    // Taking U10 off too empties the squad, which reopens the session to its groups: the result says so.
    expect(await t.asUser(admin, (tx) => editSession(tx, cup, edit({ groups: ["U12"] }), null))).toEqual({
      ok: true,
      squadRemoved: 1,
      squadEmptied: true,
    });
  });

  it("is refused for a group coach outside their groups, before or after the change", async () => {
    expect(await t.asUser(coach, (tx) => editSession(tx, cup, edit(), ["U7"]))).toEqual({ ok: false, reason: "not_yours" });
    const [{ id }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(
        `insert into sessions (kind, title, starts_at, ends_at, venue, age_groups) values ('training', 'U7 extra', now() + interval '3 days', now() + interval '3 days 1 hour', 'Hub', '{U7}') returning id`,
      ),
    );
    expect(await t.asUser(coach, (tx) => editSession(tx, id, edit({ groups: ["U7", "U10"] }), ["U7"]))).toEqual({ ok: false, reason: "not_yours" });
    expect(await t.asUser(coach, (tx) => editSession(tx, id, edit({ groups: ["U7"], title: "U7 match" }), ["U7"]))).toEqual({ ok: true, squadRemoved: 0, squadEmptied: false });
  });
});

describe("cancelling and telling the families", () => {
  let sent: Record<string, ChaseTarget[]>;
  const senders = (): Senders => {
    const record = (channel: string) => async (targets: ChaseTarget[]) => {
      sent[channel] = [...(sent[channel] ?? []), ...targets];
      return targets;
    };
    return { pushUsers: async () => new Set(), app: record("app"), email: record("email") };
  };
  // Midday in London today: outside quiet hours, a minute after the notice is (re)dated to have been posted.
  const today = londonDate(now);
  const midday = londonTime(today.year, today.month, today.day, 12, 0);
  const chaseAtMidday = async (announcementId: string) => {
    await t.asSystem((tx) => tx.query(`update announcements set posted_at = $2 where id = $1`, [announcementId, new Date(midday.getTime() - 60_000)]));
    return t.asSystem((tx) => runLadder(tx, midday, senders(), announcementId));
  };

  beforeEach(() => {
    sent = {};
  });

  it("posts one urgent message to the session's groups, emailed straight away", async () => {
    const news = await t.asUser(admin, async (tx) => {
      await cancelSession(tx, friday, true, null, "Pitch waterlogged");
      return postSessionNotice(tx, friday, "cancelled", adminStaffId);
    });
    const rows = await t.asSystem((tx) =>
      tx.query<{ id: string; title: string; body: string; audience: string[]; urgent: boolean; requires_ack: boolean; squad_session_id: string | null }>(
        `select id, title, body, audience::text[] as audience, urgent, requires_ack, squad_session_id from announcements where posted_at > now() - interval '1 minute'`,
      ),
    );
    expect(rows).toHaveLength(1);
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(coming.start);
    expect(rows[0]).toMatchObject({ id: news, title: `Training on ${day} is cancelled`, urgent: true, requires_ack: true, squad_session_id: null });
    expect(rows[0].audience).toEqual(["U6", "U7", "U10", "U12", "U15"]);
    expect(rows[0].body).toMatch(/^Pitch waterlogged\n\nCancelled: /);

    const result = await chaseAtMidday(news!);
    // Every parent with an email, with no 24-hour wait: one each for 19 children, plus Yusuf and Musa's two.
    expect(result.email).toBe(21);
    expect(sent.email.map((x) => x.email)).toContain(DEV_EMAILS.parent);
  });

  it("an ordinary message isn't emailed at post (it waits 24 hours)", async () => {
    const [{ id }] = await t.asSystem((tx) =>
      tx.query<{ id: string }>(`insert into announcements (topic, title, body, requires_ack) values ('General', 'Not urgent', 'Hello', true) returning id`),
    );
    expect((await chaseAtMidday(id)).email).toBe(0);
  });

  it("for a squad session, reaches only the squad's parents", async () => {
    await t.asSystem((tx) => tx.query(`insert into session_squads (session_id, player_id) values ($1, $2)`, [cup, DEV_IDS.yusuf]));
    const news = await t.asUser(admin, async (tx) => {
      await cancelSession(tx, cup, true, null, null);
      return postSessionNotice(tx, cup, "cancelled", adminStaffId);
    });
    const [row] = await t.asSystem((tx) => tx.query<{ squad_session_id: string; body: string }>(`select squad_session_id, body from announcements where id = $1`, [news]));
    expect(row.squad_session_id).toBe(cup);
    expect(row.body).toMatch(/^Cancelled: U10, U12, U15/);
    await chaseAtMidday(news!);
    expect(sent.email.map((x) => x.firstName).sort()).toEqual(["Adnan", "Sara"]);
  });

  it("restoring clears the reason", async () => {
    await t.asUser(admin, (tx) => cancelSession(tx, friday, true, null, "Snow"));
    await t.asUser(admin, (tx) => cancelSession(tx, friday, false, null));
    const [row] = await t.asSystem((tx) => tx.query<{ cancel_reason: string | null }>(`select cancel_reason from sessions where id = $1`, [friday]));
    expect(row.cancel_reason).toBeNull();
  });
});

describe("a parent's Friday after a cancellation", () => {
  it("shows the cancelled session and still asks about the next one", async () => {
    await t.asUser(admin, (tx) => cancelSession(tx, friday, true, null, "Pitch waterlogged"));
    const parent = await t.signIn(DEV_EMAILS.parent);
    const { week, ok, refused } = await t.asUser(parent, async (tx) => {
      const family = (await loadFamily(tx))!;
      const sessions = await loadUpcomingSessions(tx, family.children, now);
      const week = buildWeek(family.children, sessions, new Map(), new Map());
      return { week, ok: await saveAnswer(tx, nextFriday, DEV_IDS.yusuf, "coming"), refused: !(await saveAnswer(tx, friday, DEV_IDS.yusuf, "coming")) };
    });
    const yusuf = week.find((w) => w.child.id === DEV_IDS.yusuf)!;
    expect(yusuf.session?.id).toBe(nextFriday);
    expect(yusuf.cancelled.map((s) => [s.id, s.cancelReason])).toEqual([[friday, "Pitch waterlogged"]]);
    expect(ok).toBe(true);
    expect(refused).toBe(true);
  });
});

describe("deleting a session", () => {
  it("says what goes with it", async () => {
    await t.asSystem(async (tx) => {
      await tx.query(`insert into session_squads (session_id, player_id) values ($1, $2)`, [cup, DEV_IDS.yusuf]);
      await tx.query(`insert into availability (session_id, player_id, answer) values ($1, $2, 'coming')`, [cup, DEV_IDS.yusuf]);
    });
    const losses = await t.asUser(admin, (tx) => sessionLosses(tx, cup));
    expect(losses).toMatchObject({ answers: 1, picked: 1, attended: 0 });
    expect(lossesSentence(losses)).toBe("1 answer and the squad of 1 will be deleted with it. This can't be undone.");
    expect(lossesSentence({ answers: 11, plans: 1, picked: 9, messages: 0, attended: 0 })).toBe(
      "11 answers, 1 session plan and the squad of 9 will be deleted with it. This can't be undone.",
    );
  });
});
