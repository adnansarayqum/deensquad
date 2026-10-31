import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../../test/db";
import { insertNews } from "../admin/news";
import { DEV_EMAILS } from "../db/dev-seed";
import { answeredSummary } from "../../components/ThisWeek";

// Hearts on club news (migration 0042): one per parent per post, counts for everyone, names for staff only.

let t: Awaited<ReturnType<typeof testDatabase>>;
let admin: string;
let parent: string;
let staffId: string;
let post: string;

beforeEach(async () => {
  t = await testDatabase({ seed: true });
  admin = await t.signIn(DEV_EMAILS.admin);
  parent = await t.signIn(DEV_EMAILS.parent);
  [{ id: staffId }] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from staff where email = $1`, [DEV_EMAILS.admin]));
  post = await t.asUser(admin, (tx) =>
    insertNews(tx, { topic: "General", title: "Well played", body: "Great tournament.", audience: null, requiresAck: false, postedBy: staffId, squadSession: null, children: null }),
  );
});

describe("likes", () => {
  it("a parent likes once, sees the count, and can't like as anyone else", async () => {
    await t.asUser(parent, (tx) => tx.query(`insert into announcement_likes (announcement_id, guardian_id) values ($1, my_guardian_id())`, [post]));
    await expect(
      t.asUser(parent, (tx) => tx.query(`insert into announcement_likes (announcement_id, guardian_id) values ($1, my_guardian_id())`, [post])),
    ).rejects.toThrow();
    const [other] = await t.asSystem((tx) => tx.query<{ id: string }>(`select id from guardians where id <> (select guardian_id from announcement_likes limit 1) limit 1`));
    await expect(
      t.asUser(parent, (tx) => tx.query(`insert into announcement_likes (announcement_id, guardian_id) values ($1, $2)`, [post, other.id])),
    ).rejects.toThrow();
    const counts = await t.asUser(parent, (tx) => tx.query<{ likes: number }>(`select likes from announcement_like_counts($1::uuid[])`, [[post]]));
    expect(counts[0].likes).toBe(1);
    // Staff see who; the admin's own like goes nowhere (staff aren't guardians).
    const names = await t.asUser(admin, (tx) => tx.query(`select guardian_id from announcement_likes where announcement_id = $1`, [post]));
    expect(names).toHaveLength(1);
  });

  it("answeredSummary words the folded session", () => {
    const c = (firstName: string) => ({ id: firstName, firstName }) as never;
    expect(answeredSummary([{ child: c("Yusuf"), answer: "coming", checkedInAt: undefined }, { child: c("Musa"), answer: "coming", checkedInAt: undefined }])).toBe("Yusuf and Musa are coming");
    expect(answeredSummary([{ child: c("Yusuf"), answer: "coming", checkedInAt: undefined }, { child: c("Musa"), answer: "away", checkedInAt: undefined }])).toBe("Yusuf coming · Musa not coming");
    expect(answeredSummary([{ child: c("Musa"), answer: "away", checkedInAt: undefined }])).toBe("Musa isn't coming");
  });
});
