import { beforeEach, describe, expect, it } from "vitest";
import { testDatabase } from "../../test/db";
import { loadDashboard } from "./admin/dashboard";
import { deleteLeftoverAccounts, removeChildRecord } from "./admin/remove";
import { closeDeletionRequest, deletionRequestRecipients, loadMyDeletionRequest, loadOpenDeletionRequests, requestAccountDeletion } from "./data-requests";
import { DEV_EMAILS, DEV_IDS } from "./db/dev-seed";
import { deletionRequestEmail } from "./email/templates";

let t: Awaited<ReturnType<typeof testDatabase>>;
let adnan: string;
let admin: string;
const now = new Date();

beforeEach(async () => {
  t = await testDatabase({ seed: true, now });
  adnan = await t.signIn(DEV_EMAILS.parent);
  admin = await t.signIn(DEV_EMAILS.admin);
});

const dashboard = (user: string, withRequests: boolean) => t.asUser(user, (tx) => loadDashboard(tx, { now, limit: null, withShop: withRequests, withRequests }));

describe("asking the club to delete my account", () => {
  it("records the request once, and admins see it on the overview with the family's children", async () => {
    expect(await t.asUser(adnan, loadMyDeletionRequest)).toBeNull();
    expect(await t.asUser(adnan, requestAccountDeletion)).toBe(true);
    // Asking again records nothing new (and so emails the club only once).
    expect(await t.asUser(adnan, requestAccountDeletion)).toBe(false);
    expect(await t.asUser(adnan, loadMyDeletionRequest)).not.toBeNull();
    const [{ n }] = await t.asSystem((tx) => tx.query<{ n: number }>(`select count(*)::int as n from data_requests`));
    expect(n).toBe(1);

    const d = await dashboard(admin, true);
    expect(d.deletionRequests).toHaveLength(1);
    expect(d.deletionRequests![0]).toMatchObject({ parentName: "Adnan Sample" });
    expect(d.deletionRequests![0].children.map((c) => c.id).sort()).toEqual([DEV_IDS.yusuf, DEV_IDS.musa].sort());
  });

  it("is hidden from coaches and other parents, and a parent can't write a request directly", async () => {
    await t.asUser(adnan, requestAccountDeletion);
    const coach = await t.signIn(DEV_EMAILS.coach);
    expect(await t.asUser(coach, loadOpenDeletionRequests)).toEqual([]);
    expect((await dashboard(coach, false)).deletionRequests).toBeNull();
    const sara = await t.signIn(DEV_EMAILS.secondParent);
    expect(await t.asUser(sara, loadMyDeletionRequest)).toBeNull();
    await expect(
      t.asUser(sara, (tx) => tx.query(`insert into data_requests (guardian_id, kind) values ($1, 'delete')`, [DEV_IDS.adnan])),
    ).rejects.toThrow();
  });

  it("closes when the admin taps Done, and a new request can be made after that", async () => {
    await t.asUser(adnan, requestAccountDeletion);
    const [request] = await t.asUser(admin, loadOpenDeletionRequests);
    expect(await t.asUser(adnan, (tx) => closeDeletionRequest(tx, request.id))).toBe(false);
    expect(await t.asUser(admin, (tx) => closeDeletionRequest(tx, request.id))).toBe(true);
    expect(await t.asUser(admin, loadOpenDeletionRequests)).toEqual([]);
    expect(await t.asUser(adnan, requestAccountDeletion)).toBe(true);
  });

  it("closes when the admin removes the family, keeping no one's details", async () => {
    await t.asUser(adnan, requestAccountDeletion);
    for (const child of [DEV_IDS.yusuf, DEV_IDS.musa]) {
      const removed = await t.asUser(admin, (tx) => removeChildRecord(tx, child));
      await t.asSystem((tx) => deleteLeftoverAccounts(tx, removed));
    }
    expect(await t.asUser(admin, loadOpenDeletionRequests)).toEqual([]);
    const rows = await t.asSystem((tx) => tx.query<{ guardian_id: string | null; handled: boolean }>(`select guardian_id, handled_at is not null as handled from data_requests`));
    expect(rows).toEqual([{ guardian_id: null, handled: true }]);
  });

  it("emails the club's address first, then the alert and admin addresses, then the Staff screen's admins", () => {
    const staff = ["boss@club.test"];
    expect(deletionRequestRecipients({ CLUB_EMAIL: "info@club.test", ALERT_EMAIL: "dev@club.test" }, staff)).toEqual(["info@club.test"]);
    expect(deletionRequestRecipients({ ALERT_EMAIL: "dev@club.test", ADMIN_EMAILS: "a@club.test" }, staff)).toEqual(["dev@club.test"]);
    expect(deletionRequestRecipients({ ADMIN_EMAILS: "a@club.test, b@club.test" }, staff)).toEqual(["a@club.test", "b@club.test"]);
    expect(deletionRequestRecipients({ CLUB_EMAIL: " " }, staff)).toEqual(staff);
  });

  it("names the parent only in the club's email", () => {
    const email = deletionRequestEmail({ to: "info@club.test", parentName: "Adnan Sample", link: "https://app.test/admin", appUrl: "https://app.test" });
    expect(email.subject).toBe("Account deletion request: Adnan Sample");
    expect(email.text).toContain("Adnan Sample has asked the club to delete their account");
    expect(email.text).toContain("Nothing has been deleted yet");
    expect(`${email.text}${email.html}`).not.toMatch(/Yusuf|Musa|@example\.com|07700/);
  });
});
