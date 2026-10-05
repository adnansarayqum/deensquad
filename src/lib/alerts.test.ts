import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent: { to: string; subject: string }[] = [];
vi.mock("./email/send", () => ({ emailConfigured: () => true, sendEmails: async (e: { to: string; subject: string }[]) => void sent.push(...e) }));

describe("error alerts", () => {
  it("emails at most once per half hour and drops query strings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALERT_EMAIL", "dev@example.com");
    const { sendErrorAlert } = await import("./alerts");
    const t = Date.UTC(2026, 9, 5);
    expect(await sendErrorAlert({ message: "boom", path: "/shop/basket?x=secret", kind: "render" }, t)).toBe(true);
    expect(await sendErrorAlert({ message: "again", path: "/news", kind: "render" }, t + 60_000)).toBe(false);
    expect(await sendErrorAlert({ message: "later", path: "/news", kind: "render" }, t + 31 * 60_000)).toBe(true);
    expect(sent.map((s) => s.subject)).toEqual(["Deen Squad app error: /shop/basket", "Deen Squad app error: /news"]);
    vi.unstubAllEnvs();
  });
});
