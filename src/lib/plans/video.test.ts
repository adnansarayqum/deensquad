import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import type { CurrentUser } from "../auth/session";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS } from "../db/dev-seed";
import { VIDEO_ERROR } from "../video";

// A YouTube link on a session plan or practice sheet: only YouTube is accepted, and it's stored in one canonical form.
const holder: { t?: Awaited<ReturnType<typeof testDatabase>>; user?: CurrentUser & { staff: NonNullable<CurrentUser["staff"]> } } = {};

vi.mock("../db", () => ({ asUser: <T>(id: string, fn: (tx: Queryable) => Promise<T>) => holder.t!.asUser(id, fn) }));
vi.mock("../auth/session", async (importActual) => ({
  ...(await importActual<typeof import("../auth/session")>()),
  requireStaff: async () => holder.user!,
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("./run", () => ({ runPlanNotifications: async () => ({ plans: 0, sheets: 0 }) }));

const { savePlan, addPracticeSheet } = await import("./actions");
const { loadPlan, loadPracticeSheets } = await import("./data");

const ID = "dQw4w9WgXcQ";
let t: Awaited<ReturnType<typeof testDatabase>>;
let session: string;

beforeAll(async () => {
  t = holder.t = await testDatabase({ seed: true });
  const adminUser = await t.signIn(DEV_EMAILS.admin);
  const [staff] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  holder.user = { id: adminUser, email: DEV_EMAILS.admin, guardian: null, staff: { id: staff.id, role: "admin", displayName: "Admin", ageGroups: [] } };
  [{ id: session }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from sessions where 'U7' = any (age_groups) limit 1`));
});

function plan(fields: Record<string, string>): FormData {
  const f = new FormData();
  f.set("session", session);
  f.set("group", "U7");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

function sheet(fields: Record<string, string>): FormData {
  const f = new FormData();
  f.append("groups", "U7");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("session plan video", () => {
  it("refuses a link that isn't YouTube, and saves nothing", async () => {
    expect(await savePlan({}, plan({ body: "Dribbling", video: "https://youtube.com.evil.com/watch?v=" + ID }))).toEqual({ error: VIDEO_ERROR });
    expect(await t.asSystem((tx) => loadPlan(tx, session, "U7"))).toBeNull();
  });

  it("saves a plan that is only a video, stored in the canonical form; clearing the field takes it off", async () => {
    expect(await savePlan({}, plan({ video: `https://youtu.be/${ID}?si=share&t=1m5s` }))).toEqual({ saved: true });
    const [row] = await t.asSystem((tx) => tx.query<{ video_url: string }>(`select video_url from session_plans where session_id = $1 and age_group = 'U7'`, [session]));
    expect(row.video_url).toBe(`https://www.youtube.com/watch?v=${ID}&t=65`);
    expect((await t.asSystem((tx) => loadPlan(tx, session, "U7")))?.video).toEqual({ id: ID, start: 65 });

    expect(await savePlan({}, plan({ body: "Dribbling", video: "" }))).toEqual({ saved: true });
    expect((await t.asSystem((tx) => loadPlan(tx, session, "U7")))?.video).toBeNull();
  });

  it("still needs something: text, a file or a video", async () => {
    expect(await savePlan({}, plan({ body: "", video: "" }))).toEqual({ error: "Write the plan, attach a file or add a video." });
  });
});

describe("practice sheet video", () => {
  it("refuses a link that isn't YouTube", async () => {
    expect(await addPracticeSheet({}, sheet({ title: "Juggling", video: "https://vimeo.com/123" }))).toEqual({ error: VIDEO_ERROR });
    expect(await t.asSystem((tx) => tx.query(`select 1 from practice_sheets where title = 'Juggling'`))).toHaveLength(0);
  });

  it("posts a sheet with only a title and a video", async () => {
    expect(await addPracticeSheet({}, sheet({ title: "Toe taps", video: `https://www.youtube.com/shorts/${ID}` }))).toEqual({ saved: true });
    const [s] = (await t.asSystem((tx) => loadPracticeSheets(tx, ["U7"]))).filter((x) => x.title === "Toe taps");
    expect(s.video).toEqual({ id: ID, start: null });
  });

  it("still needs instructions, a sheet or a video", async () => {
    expect(await addPracticeSheet({}, sheet({ title: "Empty" }))).toEqual({ error: "Write the instructions, attach a sheet or add a video." });
  });
});
