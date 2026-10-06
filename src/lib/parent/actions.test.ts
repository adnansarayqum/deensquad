import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../auth/session";
import type { Queryable } from "../db/types";
import { testDatabase } from "../../../test/db";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";

// The parent Server Actions for payments and photo consent, run against a test database as Sara (Yusuf and Musa's mother).
const holder: { t?: Awaited<ReturnType<typeof testDatabase>>; user?: CurrentUser } = {};
vi.mock("../db", () => ({ asUser: <T>(id: string, fn: (tx: Queryable) => Promise<T>) => holder.t!.asUser(id, fn) }));
vi.mock("../auth/session", async (importActual) => ({
  ...(await importActual<typeof import("../auth/session")>()),
  requireParent: async () => holder.user!,
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

const { reportPaymentSetup, savePhotoConsent } = await import("./actions");

let t: Awaited<ReturnType<typeof testDatabase>>;
let other: string;

beforeEach(async () => {
  t = holder.t = await testDatabase({ seed: true });
  const sara = await t.signIn(DEV_EMAILS.secondParent);
  holder.user = { id: sara, email: DEV_EMAILS.secondParent, guardian: { id: DEV_IDS.sara, firstName: "Sara" }, staff: null } as CurrentUser;
  [{ id: other }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from players where id not in ($1, $2) limit 1`, [DEV_IDS.yusuf, DEV_IDS.musa]));
});
afterEach(() => vi.unstubAllEnvs());

const states = () =>
  t.asSystem((tx) => tx.query<{ player_id: string; state: string }>(`select player_id, state::text as state from payment_status order by player_id`));
const children = (...ids: string[]) => {
  const f = new FormData();
  for (const id of ids) f.append("child", id);
  return f;
};

describe("I've set it up (the family's monthly plan)", () => {
  it("covers every child of the family still missing a plan, in one tap, and never another family's child", async () => {
    vi.stubEnv("TEAMFEEPAY_URL", "https://teamfeepay.example/club");
    await t.asSystem((tx) => tx.query(`update payment_status set state = 'overdue' where player_id = $1`, [DEV_IDS.yusuf]));
    await expect(reportPaymentSetup(children(DEV_IDS.yusuf, DEV_IDS.musa, other))).rejects.toThrow("redirect /checklist");
    const after = await states();
    expect(after.filter((r) => r.player_id === DEV_IDS.yusuf || r.player_id === DEV_IDS.musa).map((r) => r.state)).toEqual(["self_reported", "self_reported"]);
    expect(after.find((r) => r.player_id === other)?.state ?? "missing").toBe("missing");
  });

  it("leaves an active plan alone", async () => {
    vi.stubEnv("TEAMFEEPAY_URL", "https://teamfeepay.example/club");
    await expect(reportPaymentSetup(children(DEV_IDS.yusuf, DEV_IDS.musa))).rejects.toThrow("redirect /checklist");
    expect((await states()).find((r) => r.player_id === DEV_IDS.yusuf)?.state).toBe("active");
  });

  it("refuses while the club has no TeamFeePay link: there was nothing to set up", async () => {
    vi.stubEnv("TEAMFEEPAY_URL", "");
    await expect(reportPaymentSetup(children(DEV_IDS.musa))).rejects.toThrow("redirect /checklist/payment");
    expect((await states()).find((r) => r.player_id === DEV_IDS.musa)).toBeUndefined();
  });
});

describe("photo consent", () => {
  it("saves the same answer for the ticked brothers and sisters, only the parent's own", async () => {
    await t.asSystem((tx) => tx.query(`update players set photo_consent = null where id = $1`, [other]));
    const f = children(DEV_IDS.musa, DEV_IDS.yusuf, other);
    f.set("consent", "no");
    await expect(savePhotoConsent(f)).rejects.toThrow("redirect /checklist");
    const rows = await t.asSystem((tx) =>
      tx.query<{ id: string; photo_consent: boolean | null }>(`select id, photo_consent from players where id in ($1, $2, $3)`, [DEV_IDS.yusuf, DEV_IDS.musa, other]),
    );
    const consent = new Map(rows.map((r) => [r.id, r.photo_consent]));
    expect([consent.get(DEV_IDS.musa), consent.get(DEV_IDS.yusuf)]).toEqual([false, false]);
    expect(consent.get(other)).toBeNull();
  });
});
