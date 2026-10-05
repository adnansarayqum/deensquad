import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "./db/types";
import type { CurrentUser } from "./auth/session";
import { testDatabase } from "../../test/db";
import { DEV_EMAILS } from "./db/dev-seed";

// Posting news and saving plans or practice sheets notify parents only once the response has gone (`after`), so a
// slow or failing push/email service never holds up or fails the save.
const holder: { t?: Awaited<ReturnType<typeof testDatabase>>; user?: CurrentUser & { staff: NonNullable<CurrentUser["staff"]> } } = {};
const scheduled: (() => unknown)[] = [];
const runChase = vi.fn<(a: { announcementId: string }) => Promise<object>>(async () => ({}));
const runPlanNotifications = vi.fn(async () => ({ plans: 0, sheets: 0 }));

vi.mock("./db", () => ({ asUser: <T>(id: string, fn: (tx: Queryable) => Promise<T>) => holder.t!.asUser(id, fn) }));
vi.mock("./auth/session", async (importActual) => ({
  ...(await importActual<typeof import("./auth/session")>()),
  requireStaff: async () => holder.user!,
  requireAdmin: async () => holder.user!,
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void scheduled.push(fn) }));
vi.mock("./chase/run", () => ({ runChase: (a: { announcementId: string }) => runChase(a) }));
vi.mock("./plans/run", () => ({ runPlanNotifications: () => runPlanNotifications() }));

const { postNews } = await import("./admin/actions");
const { savePlan, addPracticeSheet } = await import("./plans/actions");

/** Runs what `after` scheduled, as Next does once the response is sent. */
async function flushAfter() {
  const fns = scheduled.splice(0);
  for (const fn of fns) await fn();
}

let t: Awaited<ReturnType<typeof testDatabase>>;

beforeAll(async () => {
  t = holder.t = await testDatabase({ seed: true });
  const adminUser = await t.signIn(DEV_EMAILS.admin);
  const [staff] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  holder.user = { id: adminUser, email: DEV_EMAILS.admin, guardian: null, staff: { id: staff.id, role: "admin", displayName: "Admin", ageGroups: [] } };
});

beforeEach(() => {
  scheduled.length = 0;
  runChase.mockClear();
  runPlanNotifications.mockReset().mockResolvedValue({ plans: 0, sheets: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function news(requiresAck: boolean): FormData {
  const f = new FormData();
  f.set("topic", "Matches");
  f.set("title", "Meet at 9");
  f.set("body", "Bring water.");
  f.set("audience", "all");
  if (requiresAck) f.set("requiresAck", "on");
  return f;
}

describe("posting news", () => {
  it("redirects first and starts the chase once, after the response", async () => {
    const thrown = await postNews({}, news(true)).catch((e: Error) => e.message);
    const id = String(thrown).match(/^redirect \/admin\/news\/([0-9a-f-]{36})\?posted=1$/)?.[1];
    expect(id).toBeDefined();
    expect(runChase).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await flushAfter();
    expect(runChase).toHaveBeenCalledTimes(1);
    expect(runChase).toHaveBeenCalledWith({ announcementId: id });
  });

  it("doesn't chase news that needs no acknowledgement", async () => {
    await expect(postNews({}, news(false))).rejects.toThrow(/^redirect/);
    await flushAfter();
    expect(runChase).not.toHaveBeenCalled();
  });

  it("keeps the post when the chase fails afterwards", async () => {
    runChase.mockRejectedValueOnce(new Error("push service down"));
    await expect(postNews({}, news(true))).rejects.toThrow(/^redirect \/admin\/news\//);
    await expect(flushAfter()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[chase] on post:", "push service down");
  });
});

describe("saving plans and practice sheets", () => {
  it("saves a plan even when notifying parents fails", async () => {
    const [s] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where 'U10' = any (age_groups) limit 1`));
    runPlanNotifications.mockRejectedValue(new Error("push service down"));
    const f = new FormData();
    f.set("session", s.id);
    f.set("group", "U10");
    f.set("body", "Passing drills, then a match.");
    expect(await savePlan({}, f)).toEqual({ saved: true });
    expect(runPlanNotifications).not.toHaveBeenCalled();
    await expect(flushAfter()).resolves.toBeUndefined();
    expect(runPlanNotifications).toHaveBeenCalledTimes(1);
    const rows = await t.asSystem((tx) => tx.query(`select 1 from session_plans where session_id = $1 and age_group = 'U10'`, [s.id]));
    expect(rows).toHaveLength(1);
  });

  it("posts a practice sheet even when notifying parents fails", async () => {
    runPlanNotifications.mockRejectedValue(new Error("push service down"));
    const f = new FormData();
    f.set("title", "Keepy-uppy challenge");
    f.set("body", "Ten in a row.");
    f.append("groups", "U10");
    expect(await addPracticeSheet({}, f)).toEqual({ saved: true });
    await expect(flushAfter()).resolves.toBeUndefined();
    expect(runPlanNotifications).toHaveBeenCalledTimes(1);
    const rows = await t.asSystem((tx) => tx.query(`select 1 from practice_sheets where title = 'Keepy-uppy challenge'`));
    expect(rows).toHaveLength(1);
  });
});
