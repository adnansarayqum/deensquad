import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { testDatabase } from "../../../test/db";
import { loadNewsDetail } from "../admin/data";
import { insertNews } from "../admin/news";
import { DEV_EMAILS, DEV_IDS } from "../db/dev-seed";
import { reminderEmail } from "../email/templates";
import { confirmReadLink, parseReadToken, peekReadLink, readToken } from "./read-link";

// "I've read this" from the reminder email, with no sign-in (24 Nov 2026).

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let post: string;
let staffId: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  admin = await t.signIn(DEV_EMAILS.admin);
  [{ id: staffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  post = await t.asUser(admin, (tx) =>
    insertNews(tx, { topic: "General", title: "Kit day", body: "Bring kit.", audience: null, requiresAck: true, postedBy: staffId, squadSession: null, children: null }),
  );
});

describe("the email's read link", () => {
  it("names one parent and one post, and can't be altered or made up", () => {
    const token = readToken(post, DEV_IDS.sara);
    expect(parseReadToken(token)).toEqual({ newsId: post, guardianId: DEV_IDS.sara });
    // Another parent's id with this signature, a changed signature, and junk are all refused.
    const [news, , sig] = token.split(".");
    expect(parseReadToken(`${news}.${DEV_IDS.adnan}.${sig}`)).toBeNull();
    expect(parseReadToken(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(parseReadToken("nonsense")).toBeNull();
    expect(parseReadToken(`${token}.extra`)).toBeNull();
  });

  it("opening it records nothing; the tap records the read and the seen, once, as from the email", async () => {
    const token = readToken(post, DEV_IDS.sara);
    const before = await t.asSystem((tx) => peekReadLink(tx, token));
    expect(before).toMatchObject({ title: "Kit day", read: false });
    expect((await t.asUser(admin, (tx) => loadNewsDetail(tx, post)))!.readers).toEqual([]);

    expect(await t.asSystem((tx) => confirmReadLink(tx, token))).toBe(true);
    expect(await t.asSystem((tx) => confirmReadLink(tx, token))).toBe(true);
    const detail = (await t.asUser(admin, (tx) => loadNewsDetail(tx, post)))!;
    expect(detail.readers.filter((r) => r.id === DEV_IDS.sara)).toHaveLength(1);
    expect(detail.readers.find((r) => r.id === DEV_IDS.sara)).toMatchObject({ fromEmail: true, fromNotification: false });
    expect(detail.news.seenCount).toBeGreaterThanOrEqual(1);
    expect((await t.asSystem((tx) => peekReadLink(tx, token)))!.read).toBe(true);
    // A bad link does nothing.
    expect(await t.asSystem((tx) => confirmReadLink(tx, `${post}.${DEV_IDS.adnan}.wrong`))).toBe(false);
  });

  it("isn't offered for a post that needs an answer, not a tap", async () => {
    const asked = await t.asUser(admin, (tx) =>
      insertNews(tx, { topic: "General", title: "Trip?", body: "Can you come?", audience: null, requiresAck: true, postedBy: staffId, squadSession: null, children: null, quickAnswers: ["Yes", "No"] }),
    );
    expect(await t.asSystem((tx) => peekReadLink(tx, readToken(asked, DEV_IDS.sara)))).toBeNull();
  });

  it("the email says one tap and no sign-in, and gives a parent not on the app their sign-in link too", () => {
    const base = { to: "s@example.com", firstName: "Sara", title: "Kit day", body: "Bring kit.", children: ["Yusuf"], appUrl: "https://app.example" };
    const one = reminderEmail({ ...base, link: "https://app.example/read/x", oneTap: true, signInLink: "https://app.example/sign-in/link?token=abc" });
    expect(one.text).toContain("no need to sign in");
    expect(one.text).toContain("https://app.example/read/x");
    expect(one.html).toContain("sign-in/link?token=abc");
    const app = reminderEmail({ ...base, link: "https://app.example/news" });
    expect(app.text).toContain("Open the app and tap");
    expect(app.html).not.toContain("Not on the app yet");
  });
});
