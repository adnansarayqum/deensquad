import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent: { to: string; subject: string }[] = [];
let failing = false;
vi.mock("./email/send", () => ({
  emailConfigured: () => true,
  sendEmails: async (e: { to: string; subject: string }[]) => {
    if (failing) return { sent: [], failed: e };
    sent.push(...e);
    return { sent: e, failed: [] };
  },
}));

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
    // An alert that Resend refused isn't reported as sent.
    failing = true;
    expect(await sendErrorAlert({ message: "lost", path: "/news", kind: "render" }, t + 62 * 60_000)).toBe(false);
    vi.unstubAllEnvs();
  });

  it("ignores an action body Next couldn't decode, but not a JSON fault in a page", async () => {
    const { isMalformedActionBody, sendErrorAlert } = await import("./alerts");
    const bad = new SyntaxError("Unexpected end of JSON input");
    expect(isMalformedActionBody(bad, "action")).toBe(true);
    expect(isMalformedActionBody({ name: "SyntaxError", message: "Unexpected token 'n', \"not json\" is not valid JSON" }, "action")).toBe(true);
    expect(isMalformedActionBody(bad, "render")).toBe(false);
    expect(isMalformedActionBody(bad, undefined)).toBe(false);
    expect(isMalformedActionBody(new TypeError("Cannot read properties of undefined"), "action")).toBe(false);
    expect(isMalformedActionBody(new SyntaxError("Invalid regular expression"), "action")).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALERT_EMAIL", "dev@example.com");
    const before = sent.length;
    expect(await sendErrorAlert({ name: bad.name, message: bad.message, path: "/friday", kind: "action App Router" }, Date.UTC(2030, 0, 1))).toBe(false);
    expect(sent).toHaveLength(before);
    vi.unstubAllEnvs();
  });

  it("ignores a visitor leaving before the page finished loading", async () => {
    const { isClientDisconnect } = await import("./alerts");
    expect(isClientDisconnect("The destination stream closed early.")).toBe(true);
    expect(isClientDisconnect("aborted")).toBe(true);
    expect(isClientDisconnect("read ECONNRESET")).toBe(true);
    expect(isClientDisconnect("relation \"players\" does not exist")).toBe(false);
    expect(isClientDisconnect("Cannot read properties of undefined")).toBe(false);
  });
});
