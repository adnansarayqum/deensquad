import { describe, expect, it } from "vitest";
import { inviteEmail, signInEmail } from "./templates";

describe("sign-in email", () => {
  it("leads with the code and offers the link as the alternative", () => {
    const e = signInEmail({ to: "a@example.com", code: "123456", link: "https://app.test/sign-in/link?token=abc", appUrl: "https://app.test" });
    expect(e.subject.startsWith("123456")).toBe(true);
    const lines = e.text.split("\n").filter(Boolean);
    expect(lines[1]).toContain("Your sign-in code is 123456");
    expect(e.text.indexOf("123456")).toBeLessThan(e.text.indexOf("https://app.test/sign-in/link"));
    expect(e.text).toContain("once one is used, the other stops working");
    expect(e.html.indexOf("123456")).toBeLessThan(e.html.indexOf("sign-in/link"));
  });

  it("leaves invites as a link only", () => {
    const e = inviteEmail({ to: "a@example.com", firstName: "Sara", children: ["Yusuf"], link: "https://app.test/sign-in/link?token=abc", appUrl: "https://app.test" });
    expect(e.subject).toBe("Your Deen Squad parent app is ready");
    expect(e.text).toContain("Open this link to sign in. It works for 7 days:");
  });
});
