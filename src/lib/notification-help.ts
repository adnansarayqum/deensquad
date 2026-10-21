// What to tell a parent whose phone has blocked the app's notifications. Phones and browsers keep the
// switch in different places, so the steps follow the browser the page is open in.

export type BlockedHelp = { browser: "samsung" | "chrome" | "iphone" | "other"; steps: string };

export function blockedNotificationHelp(ua: string, standalone: boolean): BlockedHelp {
  if (/iPhone|iPad|iPod/.test(ua)) {
    return { browser: "iphone", steps: "Open your iPhone's Settings, then Notifications, then Deen Squad, and turn on Allow Notifications." };
  }
  if (/SamsungBrowser/.test(ua)) {
    return {
      browser: "samsung",
      steps:
        "In Samsung Internet, tap the menu (three lines) at the bottom, then Settings, Sites and downloads, Notifications, and allow this site. Also check your phone's Settings, Apps, Samsung Internet, Notifications are on.",
    };
  }
  if (/Android/.test(ua)) {
    return standalone
      ? { browser: "chrome", steps: "Open your phone's Settings, then Apps, then Deen Squad (or Chrome), then Notifications, and turn them on." }
      : {
          browser: "chrome",
          steps: "In Chrome, tap the icon to the left of the web address, then Permissions, and turn Notifications on. Then reload this page.",
        };
  }
  return { browser: "other", steps: "Allow notifications for this site in your browser's settings, then reload this page." };
}
