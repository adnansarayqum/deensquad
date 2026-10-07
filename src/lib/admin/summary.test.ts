import { describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS } from "../db/dev-seed";
import type { Email, EmailReport } from "../email/send";
import { loadMonthlySummary, monthRange, sendMonthlySummary, summaryDue, summarySections } from "./summary";

describe("which month the summary is for, and when", () => {
  it("is due from 8am London on the 1st and 2nd, for the month before", () => {
    // 1 October is British Summer Time: 8am London is 07:00 UTC.
    expect(summaryDue(new Date("2026-10-01T06:59:00Z"))).toBeNull();
    expect(summaryDue(new Date("2026-10-01T07:00:00Z"))).toEqual({ year: 2026, month: 9 });
    expect(summaryDue(new Date("2026-10-02T22:00:00Z"))).toEqual({ year: 2026, month: 9 });
    // 1 November is GMT: 07:30 UTC is still before 8am.
    expect(summaryDue(new Date("2026-11-01T07:30:00Z"))).toBeNull();
    expect(summaryDue(new Date("2026-11-01T08:00:00Z"))).toEqual({ year: 2026, month: 10 });
    // 11:30pm UTC on 31 October 2026 is still 31 October in London (GMT from 25 October).
    expect(summaryDue(new Date("2026-10-31T23:30:00Z"))).toBeNull();
    // 11:30pm UTC on 30 September is 12:30am on 1 October in London: the 1st, but before 8am.
    expect(summaryDue(new Date("2026-09-30T23:30:00Z"))).toBeNull();
    expect(summaryDue(new Date("2027-01-01T09:00:00Z"))).toEqual({ year: 2026, month: 12 });
    expect(summaryDue(new Date("2026-10-03T09:00:00Z"))).toBeNull();
    expect(summaryDue(new Date("2026-10-15T09:00:00Z"))).toBeNull();
  });

  it("covers the London calendar month, across clock changes", () => {
    expect(monthRange({ year: 2026, month: 10 })).toEqual({ from: new Date("2026-09-30T23:00:00Z"), to: new Date("2026-11-01T00:00:00Z") });
    expect(monthRange({ year: 2027, month: 3 })).toEqual({ from: new Date("2027-03-01T00:00:00Z"), to: new Date("2027-03-31T23:00:00Z") });
    expect(monthRange({ year: 2026, month: 12 }).to).toEqual(new Date("2027-01-01T00:00:00Z"));
  });
});

describe("sending the monthly summary", () => {
  async function setup() {
    const t = await testDatabase({ seed: true, now: new Date("2026-09-20T12:00:00Z") });
    const sent: Email[][] = [];
    let fail = false;
    const send = async (emails: Email[]): Promise<EmailReport> => {
      sent.push(emails);
      return fail ? { sent: [], failed: emails } : { sent: emails, failed: [] };
    };
    const run = (now: Date, env: Record<string, string | undefined> = {}) =>
      sendMonthlySummary({ system: t.asSystem, send, appUrl: "https://app.example", env }, now);
    return { t, sent, run, failAll: (v: boolean) => (fail = v) };
  }
  const first = new Date("2026-10-01T07:05:00Z");

  it("emails each admin once for the month, keyed by month and admin", async () => {
    const { t, sent, run } = await setup();
    expect(await run(new Date("2026-09-30T09:00:00Z"))).toEqual({ skipped: "not due" });
    expect(await run(new Date("2026-10-01T06:30:00Z"))).toEqual({ skipped: "not due" });
    expect(sent).toHaveLength(0);

    expect(await run(first)).toEqual({ month: "2026-09", sent: 1, failed: 0 });
    const [admin] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where role = 'admin'`));
    expect(sent[0].map((e) => [e.to, e.idempotencyKey])).toEqual([[DEV_EMAILS.admin, `summary:2026-09:${admin.id}`]]);
    expect(sent[0][0].subject).toBe("Deen Squad: September 2026 summary");

    // The next hourly runs that day and the next don't send it again.
    expect(await run(new Date("2026-10-01T08:05:00Z"))).toEqual({ skipped: "already sent" });
    expect(await run(new Date("2026-10-02T10:05:00Z"))).toEqual({ skipped: "already sent" });
    expect(sent).toHaveLength(1);
  });

  it("tries again next hour when every email failed, but not after the 2nd", async () => {
    const { t, sent, run, failAll } = await setup();
    failAll(true);
    expect(await run(first)).toEqual({ month: "2026-09", sent: 0, failed: 1 });
    expect(await t.asSystem((tx) => tx.query(`select * from monthly_summaries`))).toEqual([]);
    expect(await run(new Date("2026-10-02T21:05:00Z"))).toEqual({ month: "2026-09", sent: 0, failed: 1 });
    expect(await run(new Date("2026-10-03T08:05:00Z"))).toEqual({ skipped: "not due" });
    failAll(false);
    expect(await run(new Date("2026-10-03T09:05:00Z"))).toEqual({ skipped: "not due" });
    expect(sent).toHaveLength(2);

    // A fresh month after a failure goes as normal.
    expect(await run(new Date("2026-11-01T08:05:00Z"))).toEqual({ month: "2026-10", sent: 1, failed: 0 });
  });

  it("takes over a claim left unsent by a crash after 30 minutes", async () => {
    const { t, run } = await setup();
    await t.asSystem((tx) => tx.query(`insert into monthly_summaries (month, created_at) values ('2026-09-01', $1)`, [first]));
    expect(await run(new Date(first.getTime() + 10 * 60_000))).toEqual({ skipped: "already sent" });
    expect(await run(new Date(first.getTime() + 60 * 60_000))).toEqual({ month: "2026-09", sent: 1, failed: 0 });
  });

  it("goes to SUMMARY_EMAIL instead of the admins when it's set", async () => {
    const { sent, run } = await setup();
    await run(first, { SUMMARY_EMAIL: "owner@example.com, , other@example.com" });
    expect(sent[0].map((e) => [e.to, e.idempotencyKey])).toEqual([
      ["owner@example.com", "summary:2026-09:owner@example.com"],
      ["other@example.com", "summary:2026-09:other@example.com"],
    ]);
  });
});

describe("what the summary says", () => {
  it("gives last month's figures and today's, with links, and no names", async () => {
    const seededAt = new Date("2026-09-25T12:00:00Z");
    const t = await testDatabase({ seed: true, now: seededAt });
    await t.asSystem((tx) =>
      tx.query(
        `insert into shop_orders (status, pay_by, total_pence, paid_at, created_at) values
           ('paid', 'bank', 2500, '2026-09-12T10:00:00Z', '2026-09-11T10:00:00Z'),
           ('collected', 'card', 1000, '2026-08-30T10:00:00Z', '2026-08-30T10:00:00Z'),
           ('cancelled', 'card', 5000, null, '2026-09-13T10:00:00Z')`,
      ),
    );
    const summary = await t.asSystem((tx) => loadMonthlySummary(tx, { year: 2026, month: 9 }, new Date("2026-10-01T07:05:00Z")));
    const [month, now] = summarySections(summary);
    expect(month.title).toBe("In September");
    expect(month.lines.map((l) => l.text)).toMatchInlineSnapshot(`
      [
        "Sessions: 4 held, 0 cancelled.",
        "Attendance: 9% of the children expected were checked in (August: 6%).",
        "U7: 20% over 2 sessions with the register taken (August: no register taken).",
        "U10: 6% over 3 sessions with the register taken (August: 6%).",
        "Joined: 0 children and 0 new parents.",
        "News: 3 messages posted. On the 3 that asked, 3% of parents tapped ‘I’ve read this’.",
        "Shop: 1 order placed, £25.00 paid.",
      ]
    `);
    expect(month.lines.map((l) => l.path)).toContain("/admin/shop");
    expect(now.title).toBe("Right now");
    expect(now.lines.map((l) => l.path)).toEqual([
      "/admin/families?need=signin",
      "/admin/families?need=missing",
      "/admin/families?need=overdue",
      "/admin/families?need=contract",
      "/admin/families?need=missing3",
      "/admin",
    ]);
    const all = JSON.stringify([month, now]);
    expect(all).not.toMatch(/Yusuf|Musa|Sample|Adnan|Sara/);
  });
});
