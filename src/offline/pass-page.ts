// The script of the offline attendance QR page (public/offline-pass.html), which the service worker shows for
// /pass and /friday when there's no signal. Built into public/offline-pass.js by `npm run offline`
// (scripts/build-offline.mjs) with the same QR library the app uses. Draws the codes saved on this phone
// (src/lib/pass/cache.ts), and the parent's own sports hub entry code saved with them; the page itself holds no one's data.

import QRCode from "qrcode";
import { groupPlural } from "../lib/domain";
import { phoneStorage, readHubCache, readPassCache } from "../lib/pass/cache";
import { VENUE_QR_OPTIONS } from "../lib/venue-pass/qr";

async function draw() {
  const list = document.getElementById("codes");
  const none = document.getElementById("none");
  if (!list || !none) return;
  const storage = phoneStorage();
  const passes = readPassCache(storage);
  const hub = readHubCache(storage);
  none.hidden = passes.length > 0 || hub !== null;
  for (const pass of passes) {
    const section = document.createElement("section");
    section.className = "code";
    const name = document.createElement("h2");
    name.textContent = `${pass.firstName} · ${groupPlural(pass.ageGroup)}`;
    const picture = document.createElement("div");
    picture.className = "qr";
    picture.setAttribute("role", "img");
    picture.setAttribute("aria-label", `QR code that checks ${pass.firstName} in`);
    try {
      // The same picture /pass draws on the server.
      picture.innerHTML = await QRCode.toString(pass.token, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#13201a", light: "#ffffff" } });
    } catch {
      continue;
    }
    section.append(name, picture);
    list.append(section);
  }
  if (hub) await drawHub(list, hub);
}

/** The parent's sports hub entry code: drawn again from its text, as /pass does, or the saved screenshot. */
async function drawHub(list: HTMLElement, hub: NonNullable<ReturnType<typeof readHubCache>>) {
  const section = document.createElement("section");
  section.className = "code";
  const name = document.createElement("h2");
  name.className = "small";
  name.textContent = "Your sports hub entry code";
  const picture = document.createElement("div");
  picture.className = "qr";
  if ("text" in hub) {
    picture.setAttribute("role", "img");
    picture.setAttribute("aria-label", "Your sports hub entry QR code");
    try {
      picture.innerHTML = await QRCode.toString(hub.text, { type: "svg", ...VENUE_QR_OPTIONS });
    } catch {
      return;
    }
  } else {
    const img = document.createElement("img");
    img.src = hub.image;
    img.alt = "Your sports hub entry code (your screenshot)";
    picture.append(img);
  }
  section.append(name, picture);
  list.append(section);
}

document.getElementById("retry")?.addEventListener("click", () => location.reload());
void draw();
