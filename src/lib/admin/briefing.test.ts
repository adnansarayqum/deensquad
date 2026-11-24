import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { testDatabase } from "../../../test/db";
import { DEV_EMAILS } from "../db/dev-seed";
import type { Email } from "../email/send";
import { briefingDue, sendMondayBriefing } from "./briefing";

// The admins' Monday briefing.

let t: Awaited<ReturnType<typeof testDatabase>>;
const sent: Email[] = [];

beforeEach(async () => {
  sent.length = 0;
  t = await testDatabase({ seed: true });
  await t.signIn(DEV_EMAILS.admin);
});

const deps = (ok = true) => ({
  system: t.asSystem,
  asUser: t.asUser,
  send: async (emails: Email[]) => {
    if (ok) sent.push(...emails);
    return ok ? { sent: emails, failed: [] } : { sent: [], failed: emails };
  },
  appUrl: "https://app.example",
});

describe("Monday briefing", () => {
  it("is due on Monday morning in London only", () => {
    expect(briefingDue(new Date("2026-11-23T08:07:00Z"))).toBe(true);
    expect(briefingDue(new Date("2026-11-23T07:07:00Z"))).toBe(false);
    expect(briefingDue(new Date("2026-11-23T12:07:00Z"))).toBe(false);
    expect(briefingDue(new Date("2026-11-24T08:07:00Z"))).toBe(false);
  });

  it("emails each admin once that week what the overview's Needs you shows, with links", async () => {
    const monday = new Date("2026-11-23T08:07:00Z");
    const first = await sendMondayBriefing(deps(), monday);
    expect(first).toMatchObject({ due: true, sent: 1 });
    expect(first.lines).toBeGreaterThan(0);
    expect(sent[0].to).toBe(DEV_EMAILS.admin);
    expect(sent[0].subject).toMatch(/^Deen Squad this week: \d+ things? needs? you$/);
    expect(sent[0].text).toContain("https://app.example/admin/");
    expect(sent[0].idempotencyKey).toMatch(/^monday-briefing:2026-11-23:/);
    // The 9am run that week sends nothing more; next Monday's does.
    expect((await sendMondayBriefing(deps(), new Date("2026-11-23T09:07:00Z"))).sent).toBe(0);
    expect((await sendMondayBriefing(deps(), new Date("2026-11-30T08:07:00Z"))).sent).toBe(1);
  });

  it("tries again at the next run when nothing could be sent", async () => {
    const monday = new Date("2026-11-23T08:07:00Z");
    expect((await sendMondayBriefing(deps(false), monday)).sent).toBe(0);
    expect((await sendMondayBriefing(deps(), new Date("2026-11-23T09:07:00Z"))).sent).toBe(1);
  });
});
