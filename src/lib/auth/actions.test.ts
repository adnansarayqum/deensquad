import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Queryable } from "../db/types";
import { DEV_EMAILS } from "../db/dev-seed";
import { testDatabase } from "../../../test/db";
import { PENDING_COOKIE } from "./cookies";
import { LIMITS, verifyCode } from "./service";

// requestCode as the sign-in screen calls it: with the email service failing, and from a member and a stranger alike.
const holder: { t?: Awaited<ReturnType<typeof testDatabase>>; failing: boolean; outbox: { to: string; code: string }[] } = { failing: false, outbox: [] };
const jar = new Map<string, string>();

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({
  asSystem: <T>(fn: (tx: Queryable) => Promise<T>) => holder.t!.asSystem(fn),
}));
vi.mock("../email/send", () => ({
  canSendEmail: () => true,
  sendEmails: async (emails: { to: string; text: string }[]) => {
    if (holder.failing) return { sent: [], failed: emails };
    holder.outbox.push(...emails.map((e) => ({ to: e.to, code: e.text.match(/\b(\d{6})\b/)?.[1] ?? "" })));
    return { sent: emails, failed: [] };
  },
}));
vi.mock("../alerts", () => ({ sendErrorAlert: async () => false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

const { requestCode } = await import("./actions");

let t: Awaited<ReturnType<typeof testDatabase>>;

const ask = async (email: string) => {
  const form = new FormData();
  form.set("email", email);
  return requestCode({}, form).then(
    (state) => ({ state, pending: null as null | { id: string; to: string } }),
    (error: Error) => ({ state: error.message, pending: JSON.parse(jar.get(PENDING_COOKIE)!) as { id: string; to: string } }),
  );
};
const requests = async (email: string) =>
  (await t.asSystem((tx) => tx.query<{ id: string }>(`select id from auth.sign_in_requests where email = $1 order by created_at`, [email]))).map((r) => r.id);

beforeAll(async () => {
  t = holder.t = await testDatabase({ seed: true });
});

beforeEach(async () => {
  jar.clear();
  holder.failing = false;
  holder.outbox = [];
  await t.asSystem((tx) => tx.query(`delete from auth.sign_in_requests`));
});

describe("requestCode", () => {
  it("doesn't spend the hour's codes on emails that couldn't be sent", async () => {
    holder.failing = true;
    for (let i = 0; i < 2 * LIMITS.perEmailPerHour; i++) {
      expect((await ask(DEV_EMAILS.parent)).state).toEqual({ error: "We couldn't send the email just now. Try again in a minute." });
    }
    expect(await requests(DEV_EMAILS.parent)).toEqual([]);

    holder.failing = false;
    const { state, pending } = await ask(DEV_EMAILS.parent);
    expect(state).toBe("redirect /sign-in/code");
    expect(holder.outbox).toEqual([{ to: DEV_EMAILS.parent, code: expect.stringMatching(/^\d{6}$/) }]);
    const [id] = await requests(DEV_EMAILS.parent);
    expect(pending).toMatchObject({ id, to: "a•••@example.com" });
    expect((await t.asSystem((tx) => verifyCode(tx, id, holder.outbox[0].code, new Date()))).ok).toBe(true);
  });

  it("shows a member who has had the hour's codes the same screen as a stranger, and sends nothing more", async () => {
    const known = DEV_EMAILS.parent;
    const stranger = "nobody@example.org";
    const seen: { known: string; stranger: string }[] = [];
    for (let i = 0; i < LIMITS.perEmailPerHour + 1; i++) {
      const a = await ask(known);
      const b = await ask(stranger);
      seen.push({ known: a.state as string, stranger: b.state as string });
      // Same outcome and the same screen (the masked address apart) every time.
      expect(a.state).toBe("redirect /sign-in/code");
      expect(b.state).toBe("redirect /sign-in/code");
      expect(a.pending).toMatchObject({ to: "a•••@example.com" });
      expect(b.pending).toMatchObject({ to: "n•••@example.org" });
    }
    expect(seen).toHaveLength(LIMITS.perEmailPerHour + 1);
    // Five codes went to the member, none to the stranger; the sixth ask sent nothing.
    expect(holder.outbox.map((e) => e.to)).toEqual(Array(LIMITS.perEmailPerHour).fill(known));
    const ids = await requests(known);
    expect(ids).toHaveLength(LIMITS.perEmailPerHour);
    // "Already got a code? Enter the latest one.": the screen after the refused ask takes the newest code.
    const sixth = await ask(known);
    expect(sixth.pending?.id).toBe(ids.at(-1));
    expect((await t.asSystem((tx) => verifyCode(tx, sixth.pending!.id, holder.outbox.at(-1)!.code, new Date()))).ok).toBe(true);
  });

  it("still says so when one address has asked for too many codes, member or not", async () => {
    const emails = await t.asSystem((tx) => tx.query<{ email: string }>(`select email from guardians where email like 'parent%' order by email`));
    await t.asSystem((tx) =>
      tx.query(
        `insert into auth.sign_in_requests (email, purpose, link_hash, ip, created_at, expires_at)
         select e, 'sign_in', md5(e || i::text), '203.0.113.9', now(), now() + interval '15 minutes'
         from unnest($1::text[]) as e, generate_series(1, $2::int) as i`,
        [emails.map((e) => e.email), Math.ceil(LIMITS.perIpPerHour / emails.length)],
      ),
    );
    expect((await ask(DEV_EMAILS.parent)).state).toEqual({ error: "That's a lot of codes in one hour. Wait a little while, then try again." });
    expect(holder.outbox).toEqual([]);
  });
});
