import { describe, expect, it } from "vitest";
import { isPushEndpoint } from "./push-endpoint";

describe("isPushEndpoint", () => {
  it("accepts the browsers' push services", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc:APA91b",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB",
      "https://autopush.push.services.mozilla.com/wpush/v2/x",
    ]) {
      expect(isPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it("refuses anything else", () => {
    for (const endpoint of [
      undefined,
      42,
      "",
      "not a url",
      "http://fcm.googleapis.com/fcm/send/abc", // not https
      "https://fcm.googleapis.com:8443/fcm/send/abc", // a port
      "https://user@fcm.googleapis.com/fcm/send/abc", // a user name
      "https://push.example/abc",
      "https://evil.example/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.example/x",
      "https://push.apple.com/x", // the bare suffix isn't a push host
      "https://evilpush.apple.com.example/x",
      "https://notify.windows.com.evil.example/x",
      "https://127.0.0.1/x",
      "https://localhost/x",
      `https://fcm.googleapis.com/${"a".repeat(1000)}`,
    ]) {
      expect(isPushEndpoint(endpoint), String(endpoint)).toBe(false);
    }
  });
});
