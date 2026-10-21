import { describe, expect, it } from "vitest";
import { blockedNotificationHelp } from "./notification-help";

const SAMSUNG =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";
const CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("blockedNotificationHelp", () => {
  it("gives Samsung Internet its own steps, though its user agent also says Chrome", () => {
    const help = blockedNotificationHelp(SAMSUNG, false);
    expect(help.browser).toBe("samsung");
    expect(help.steps).toContain("Sites and downloads");
  });

  it("points Chrome in the browser to the address bar, and the installed app to the phone's settings", () => {
    expect(blockedNotificationHelp(CHROME, false).steps).toContain("left of the web address");
    expect(blockedNotificationHelp(CHROME, true).steps).toContain("Apps, then Deen Squad");
  });

  it("points iPhones to Settings", () => {
    expect(blockedNotificationHelp(IPHONE, true).browser).toBe("iphone");
  });

  it("falls back to the browser's settings", () => {
    expect(blockedNotificationHelp("Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0", false).browser).toBe("other");
  });
});
