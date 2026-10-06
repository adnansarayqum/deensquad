// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { doNotTrack, flush, setAnalyticsOn, setAnalyticsSender, track, trackPageview, type Hit } from "./analytics";

const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

afterEach(() => {
  setAnalyticsOn(false);
  window.history.replaceState(null, "", "/");
});

describe("track", () => {
  it("does nothing while analytics is off", () => {
    const sender = vi.fn(() => true);
    track("news_acknowledged");
    trackPageview();
    setAnalyticsSender(sender);
    setAnalyticsOn(true);
    setAnalyticsSender(sender);
    expect(sender).not.toHaveBeenCalled();
  });

  it("sends named events with fixed labels at the normalised address", () => {
    const sent: [Hit, string][] = [];
    setAnalyticsOn(true);
    setAnalyticsSender((hit, url) => sent.push([hit, url]) > 0);
    window.history.replaceState(null, "", `/admin/families/${ID}?need=contract`);
    trackPageview();
    track("availability_answered", { answer: "coming" });
    expect(sent).toEqual([
      [{ name: null, props: undefined }, "http://localhost:3000/admin/families/:id"],
      [{ name: "availability_answered", props: { answer: "coming" } }, "http://localhost:3000/admin/families/:id"],
    ]);
  });

  it("holds hits until the provider's script is ready, then sends them in order", () => {
    let ready = false;
    const sent: string[] = [];
    setAnalyticsOn(true);
    setAnalyticsSender((hit) => ready && sent.push(hit.name ?? "pageview") > 0);
    trackPageview();
    track("install_gate_shown", { mode: "ios" });
    expect(sent).toEqual([]);
    ready = true;
    flush();
    expect(sent).toEqual(["pageview", "install_gate_shown"]);
  });
});

describe("doNotTrack", () => {
  it("is on when the browser sends Do Not Track", () => {
    expect(doNotTrack()).toBe(false);
    Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
    expect(doNotTrack()).toBe(true);
    Reflect.deleteProperty(navigator, "doNotTrack");
    expect(doNotTrack()).toBe(false);
  });
});
