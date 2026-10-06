// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installGateMode, readDismissCount, readSessionDismissed, recordDismiss, resetInstallGateMemory, type InstallGateInput } from "./install-gate";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const INSTAGRAM = `${IPHONE} Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; en_GB)`;

const ANDROID_INSTAGRAM = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0 Android (34/14; 420dpi; 1080x2400; Google; Pixel 7; panther; panther; en_GB)";

const base: InstallGateInput = {
  ua: IPHONE,
  path: "/news",
  standalone: false,
  coarse: true,
  width: 390,
  isStaff: false,
  dismissCount: 0,
  sessionDismissed: false,
  hasPrompt: false,
};
const mode = (over: Partial<InstallGateInput>) => installGateMode({ ...base, ...over });

describe("installGateMode", () => {
  it("shows the iPhone steps to a parent in Safari, with Not now", () => {
    expect(mode({})).toEqual({ mode: "ios", offerNotNow: true });
  });

  it("treats an iPad asking for the desktop site as iOS, but not a Mac", () => {
    expect(mode({ ua: IPAD_DESKTOP, width: 820 }).mode).toBe("ios");
    expect(mode({ ua: IPAD_DESKTOP, coarse: false }).mode).toBe("hidden");
  });

  it.each([
    ["Instagram", INSTAGRAM],
    ["Facebook", `${IPHONE} [FBAN/FBIOS;FBAV/480.0.0.0]`],
    ["Google app (Gmail links)", `${IPHONE} GSA/350.0.0`],
    ["Line", `${IPHONE} Line/14.0.0`],
    ["WhatsApp", `${IPHONE} WhatsApp/24.0`],
  ])("sends %s's in-app browser to Safari first", (_name, ua) => {
    expect(mode({ ua }).mode).toBe("ios-inapp");
  });

  it("offers the install button on Android when the browser has a prompt ready, and steps when it hasn't", () => {
    expect(mode({ ua: ANDROID, hasPrompt: true })).toEqual({ mode: "android-prompt", offerNotNow: true });
    expect(mode({ ua: ANDROID })).toEqual({ mode: "android-manual", offerNotNow: true });
  });

  it.each([
    ["Instagram", ANDROID_INSTAGRAM],
    ["Facebook", `${ANDROID} [FB_IAB/FB4A;FBAV/480.0.0.0;]`],
    ["Google app (Gmail links)", `${ANDROID} GSA/15.0.0`],
    ["Line", `${ANDROID} Line/14.0.0`],
  ])("sends %s's in-app browser on Android to Chrome first", (_name, ua) => {
    expect(mode({ ua })).toEqual({ mode: "android-inapp", offerNotNow: true });
    expect(mode({ ua, dismissCount: 2 })).toEqual({ mode: "android-inapp", offerNotNow: false });
  });

  it("uses the install button even inside an app on Android if that browser offers its prompt", () => {
    expect(mode({ ua: ANDROID_INSTAGRAM, hasPrompt: true }).mode).toBe("android-prompt");
  });

  it("never covers the attendance QR code, but does the screens around it", () => {
    expect(mode({ path: "/pass" }).mode).toBe("hidden");
    expect(mode({ path: "/pass/", ua: ANDROID, hasPrompt: true }).mode).toBe("hidden");
    expect(mode({ path: "/passport" }).mode).toBe("ios");
    expect(mode({ path: "/friday" }).mode).toBe("ios");
  });

  it("offers Not now twice, then only Continue in browser", () => {
    expect(mode({ dismissCount: 1 }).offerNotNow).toBe(true);
    expect(mode({ dismissCount: 2 })).toEqual({ mode: "ios", offerNotNow: false });
    expect(mode({ ua: ANDROID, dismissCount: 5 })).toEqual({ mode: "android-manual", offerNotNow: false });
  });

  it.each([
    ["installed (standalone)", { standalone: true }],
    ["staff, even if also a parent", { isStaff: true }],
    ["a mouse or trackpad (desktop)", { coarse: false }],
    ["a screen at the lg breakpoint or wider", { width: 1024 }],
    ["already dismissed this session", { sessionDismissed: true }],
  ] as const)("stays hidden when %s", (_name, over) => {
    expect(mode(over)).toEqual({ mode: "hidden", offerNotNow: false });
    expect(mode({ ...over, ua: ANDROID, hasPrompt: true }).mode).toBe("hidden");
  });

  it("shows just under the lg breakpoint (a portrait tablet)", () => {
    expect(mode({ width: 1023 }).mode).toBe("ios");
  });
});

describe("install gate storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    resetInstallGateMemory();
  });

  it("counts dismissals across sessions and hides for the rest of this one", () => {
    expect(readDismissCount()).toBe(0);
    expect(readSessionDismissed()).toBe(false);
    recordDismiss();
    expect(readSessionDismissed()).toBe(true);
    expect(readDismissCount()).toBe(1);
    // A new visit: session storage and memory are fresh, the count stays.
    sessionStorage.clear();
    resetInstallGateMemory();
    expect(readSessionDismissed()).toBe(false);
    recordDismiss();
    expect(readDismissCount()).toBe(2);
  });

  it("ignores a junk count", () => {
    localStorage.setItem("ds-install-gate-count", "lots");
    expect(readDismissCount()).toBe(0);
  });

  it("still works when storage throws: count 0, dismissed in memory", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readDismissCount()).toBe(0);
    expect(readSessionDismissed()).toBe(false);
    expect(() => recordDismiss()).not.toThrow();
    expect(readSessionDismissed()).toBe(true);
    expect(readDismissCount()).toBe(0);
  });
});
