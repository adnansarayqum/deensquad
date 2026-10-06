import { describe, expect, it } from "vitest";
import type { Child, Session } from "../domain";
import type { AnswerRecord } from "./data";
import { answeredLine, availabilityQuestion, buildChecklist, buildFamilyChecklist, buildWeek, countSteps, directionsUrl, computeStats, joinNames, sessionsToday, squadInvites, weekSummary } from "./views";

const child = (id: string, name: string, group: Child["ageGroup"]): Child => ({
  id,
  firstName: name,
  lastName: "S",
  shirtNumber: null,
  ageGroup: group,
  position: null,
  joinedOn: "2026-09-01",
  photoConsent: null,
});
const session = (id: string, groups: Child["ageGroup"][], cancelled = false): Session => ({
  id,
  kind: "training",
  title: "Training",
  startsAt: "2026-10-09T17:30:00Z",
  endsAt: "2026-10-09T19:00:00Z",
  venue: "Hub",
  ageGroups: groups,
  arriveBy: null,
  kit: null,
  prayerNote: null,
  notes: null,
  cancelled,
  cancelReason: null,
});

describe("the week for a family", () => {
  const kids = [child("a", "Yusuf", "U10"), child("b", "Musa", "U7")];
  it("asks about every child who hasn't answered", () => {
    const week = buildWeek(kids, [session("s", ["U7", "U10"])], new Map(), new Map());
    expect(weekSummary(week)).toBe("Are Yusuf and Musa coming?");
  });
  it("knows which children have a session today (London), on the day only", () => {
    const week = buildWeek(kids, [session("s", ["U10"])], new Map(), new Map());
    expect(sessionsToday(week, new Date("2026-10-09T08:00:00Z")).map((t) => t.child.firstName)).toEqual(["Yusuf"]);
    expect(sessionsToday(week, new Date("2026-10-08T22:59:00Z"))).toEqual([]); // still Thursday in London
    expect(sessionsToday(week, new Date("2026-10-09T23:00:00Z"))).toEqual([]); // Saturday in London
  });
  it("summarises answers", () => {
    const week = buildWeek(kids, [session("s", ["U7", "U10"])], new Map([["s:a", "coming"], ["s:b", "away"]]), new Map());
    expect(weekSummary(week)).toBe("Yusuf coming · Musa away");
  });
  it("gives each child their own group's session", () => {
    const week = buildWeek(kids, [session("u9", ["U10"]), session("u7", ["U7"])], new Map(), new Map());
    expect(week.map((w) => w.session?.id)).toEqual(["u9", "u7"]);
  });
  it("skips a cancelled session to the next one and lists the cancellation beside it", () => {
    const later = { ...session("next", ["U10", "U7"]), startsAt: "2026-10-16T17:30:00Z", endsAt: "2026-10-16T19:00:00Z" };
    const off = { ...session("off", ["U10", "U7"], true), cancelReason: "Pitch waterlogged" };
    const week = buildWeek(kids, [off, later], new Map([["next:a", "coming"]]), new Map());
    expect(week.map((w) => [w.session?.id, w.cancelled.map((s) => s.id)])).toEqual([
      ["next", ["off"]],
      ["next", ["off"]],
    ]);
    expect(week[0].answer).toBe("coming");
    expect(weekSummary(week)).toBe("Is Musa coming?");
  });
  it("still lists a cancellation when there's no later session", () => {
    const week = buildWeek(kids.slice(0, 1), [session("off", ["U10"], true)], new Map(), new Map());
    expect(week[0].session).toBeUndefined();
    expect(week[0].cancelled.map((s) => s.id)).toEqual(["off"]);
  });
  it("joins names", () => expect(joinNames(["A", "B", "C"])).toBe("A, B and C"));
});

describe("checked in today", () => {
  const kids = [child("a", "Yusuf", "U10"), child("b", "Musa", "U7")];
  it("marks a checked-in child as here, whatever was answered, and stops asking about them", () => {
    const week = buildWeek(kids, [session("s", ["U7", "U10"])], new Map([["s:a", "away"]]), new Map(), {
      checkIns: new Map([["s:a", "2026-10-09T16:58:00Z"], ["other:b", "2026-10-09T16:00:00Z"]]),
    });
    expect(week.map((w) => w.checkedInAt)).toEqual(["2026-10-09T16:58:00Z", undefined]);
    expect(weekSummary(week)).toBe("Is Musa coming?");
    expect(weekSummary(week.slice(0, 1))).toBe("Yusuf is coming");
  });
});

describe("who answered", () => {
  const kids = [child("a", "Yusuf", "U10")];
  const now = new Date("2026-10-08T12:00:00Z"); // Thursday in London
  const bySara: AnswerRecord = { answer: "away", by: { id: "g-sara", name: "Sara" }, at: "2026-10-06T13:02:00Z" };
  it("carries who gave the answer onto the child's week and squad invites", () => {
    const sessions = [session("fri", ["U10"]), { ...session("cup", ["U10"]), kind: "tournament" as const, startsAt: "2026-10-17T09:00:00Z", squad: ["a"] }];
    const records = new Map<string, AnswerRecord>([["fri:a", bySara], ["cup:a", { ...bySara, answer: "coming" }]]);
    const answers = new Map([...records].map(([k, r]) => [k, r.answer]));
    const week = buildWeek(kids, sessions, answers, new Map(), { records });
    expect(week[0].answered).toBe(bySara);
    expect(squadInvites(week, sessions, answers, records)[0].answered?.answer).toBe("coming");
  });
  it("names the other parent, or says you, with the day and time", () => {
    expect(answeredLine(bySara, "g-adnan", now)).toBe("Not this week · answered by Sara, Tue 2:02pm");
    expect(answeredLine(bySara, "g-sara", now)).toBe("Not this week · answered by you, Tue 2:02pm");
    expect(answeredLine({ ...bySara, answer: "coming", at: "2026-10-08T08:12:00Z" }, "g-adnan", now)).toBe("Coming · answered by Sara, today 9:12am");
    expect(answeredLine({ ...bySara, answer: "coming" }, "g-adnan", now, true)).toBe("Can play · answered by Sara, Tue 2:02pm");
  });
  it("gives a date for an answer more than a week old", () => {
    expect(answeredLine({ ...bySara, at: "2026-09-28T13:02:00Z" }, "g-adnan", now)).toBe("Not this week · answered by Sara, 28 Sept 2:02pm");
  });
  it("shows no name when the answer has no guardian (older answers) or theirs can't be seen", () => {
    expect(answeredLine({ ...bySara, by: null }, "g-adnan", now)).toBe("Not this week · answered Tue 2:02pm");
    expect(answeredLine({ ...bySara, by: { id: "g-gone", name: null } }, "g-adnan", now)).toBe("Not this week · answered Tue 2:02pm");
  });
});

describe("tournament squads for a family", () => {
  const kids = [child("a", "Yusuf", "U10"), child("b", "Ahmed", "U10")];
  const cup = (startsAt: string): Session => ({ ...session("cup", ["U10"]), kind: "tournament", title: "Spring Cup", startsAt, squad: ["a"] });
  it("makes a squad session the next one only for the picked child, and asks if they can play", () => {
    const week = buildWeek(kids, [cup("2026-10-08T09:00:00Z"), session("fri", ["U10"])], new Map(), new Map());
    expect(week.map((w) => w.session?.id)).toEqual(["cup", "fri"]);
    expect(weekSummary(week.slice(0, 1))).toBe("Can Yusuf play?");
    expect(availabilityQuestion("Yusuf", week[0].session!, "Thu 8 Oct")).toBe("Can Yusuf play in Spring Cup on Thu 8 Oct?");
    expect(availabilityQuestion("Ahmed", week[1].session!, "Fri 9 Oct")).toBe("Is Ahmed coming? Fri 9 Oct");
    expect(squadInvites(week, [cup("2026-10-08T09:00:00Z"), session("fri", ["U10"])], new Map())).toEqual([]);
  });
  it("asks about a later squad session beside the next training, with the answer already given", () => {
    const sessions = [session("fri", ["U10"]), cup("2026-10-17T09:00:00Z")];
    const week = buildWeek(kids, sessions, new Map(), new Map());
    expect(week.map((w) => w.session?.id)).toEqual(["fri", "fri"]);
    const invites = squadInvites(week, sessions, new Map([["cup:a", "away"]]));
    expect(invites.map((i) => [i.child.firstName, i.session.id, i.answer])).toEqual([["Yusuf", "cup", "away"]]);
    expect(squadInvites(week, [session("fri", ["U10"]), { ...cup("2026-10-17T09:00:00Z"), cancelled: true }], new Map())).toEqual([]);
  });
});

describe("player stats", () => {
  const weeks = ["2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02"].map((d, i) => ({ id: `s${i}`, startsAt: `${d}T17:30:00Z` }));
  it("counts the streak back from the latest week", () => {
    expect(computeStats(weeks, new Set(["s0", "s2", "s3"]))).toEqual({ sessions: 3, attendancePct: 75, streakWeeks: 2 });
  });
  it("has no percentage before the first session", () => {
    expect(computeStats([], new Set())).toEqual({ sessions: 0, attendancePct: null, streakWeeks: 0 });
  });
});

describe("the to-do list", () => {
  const kids = [child("a", "Yusuf", "U10"), child("b", "Ali", "U10"), child("c", "Maryam", "U7")];
  const facts = (payment: [string, "active" | "missing" | "overdue" | "self_reported"][], agreed: string[]) => ({
    contacts: new Map<string, number>(),
    payment: new Map(payment),
    agreed: new Set(agreed),
  });
  it("asks once for the family's monthly plan, naming the children it covers, with the fee", () => {
    const [payment] = buildFamilyChecklist(kids, facts([["a", "active"]], []), "£30 a month per child");
    expect(payment).toMatchObject({ id: "payment-plan", done: false, detail: "£30 a month per child", note: "Covers Ali and Maryam" });
    expect(buildFamilyChecklist(kids, facts([], []), null)[0].detail).toBe("Ask the club about fees");
    expect(buildFamilyChecklist(kids, facts([["b", "overdue"]], []), null)[0]).toMatchObject({ detail: "A payment is overdue for Ali. Check TeamFeePay", actionLabel: "Check" });
    const done = buildFamilyChecklist(kids, facts([["a", "active"], ["b", "self_reported"], ["c", "active"]], []), null)[0];
    expect(done).toMatchObject({ done: true, detail: "You've set it up · the club will confirm", note: undefined });
  });
  it("keeps the contract per child but in one row, each child with their own state", () => {
    const [, contract] = buildFamilyChecklist(kids, facts([], ["b"]), null);
    expect(contract.parts?.map((p) => [p.name, p.done])).toEqual([["Yusuf", false], ["Ali", true], ["Maryam", false]]);
    expect(contract).toMatchObject({ done: false, href: "/checklist/agreement?child=a", steps: { done: 1, total: 3 } });
    expect(contract.detail).toBe("Read and agree with each child: Yusuf and Maryam still to sign");
  });
  it("counts steps: per-child steps, one payment step, and a contract step per child", () => {
    const items = [...buildFamilyChecklist(kids, facts([], ["b"]), null), ...kids.flatMap((k) => buildChecklist(k, facts([], [])))];
    expect(countSteps(items)).toEqual({ done: 3 + 1, total: 9 + 1 + 3 });
  });
  it("one child: the same wording as before, no per-child parts", () => {
    const [payment, contract] = buildFamilyChecklist(kids.slice(0, 1), facts([], []), null);
    expect(payment.note).toBeUndefined();
    expect(contract).toMatchObject({ detail: "Read and agree with Yusuf", parts: undefined });
  });
});

describe("directions to a venue", () => {
  it("searches Google Maps for a known venue, and gives none while it's to be confirmed", () => {
    expect(directionsUrl("Bobby Moore Sports Hub, E15")).toBe("https://www.google.com/maps/search/?api=1&query=Bobby%20Moore%20Sports%20Hub%2C%20E15");
    expect(directionsUrl("Venue to be confirmed")).toBeNull();
    expect(directionsUrl("TBC")).toBeNull();
    expect(directionsUrl("  ")).toBeNull();
  });
});
