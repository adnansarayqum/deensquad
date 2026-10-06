// The script of the offline attendance QR page (public/offline-pass.html), which the service worker shows for
// /pass and /friday when there's no signal. Built into public/offline-pass.js by `npm run offline`
// (scripts/build-offline.mjs) with the same QR library the app uses. Draws the codes saved on this phone
// (src/lib/pass/cache.ts); the page itself holds no one's data.

import QRCode from "qrcode";
import { phoneStorage, readPassCache } from "../lib/pass/cache";

async function draw() {
  const list = document.getElementById("codes");
  const none = document.getElementById("none");
  if (!list || !none) return;
  const passes = readPassCache(phoneStorage());
  none.hidden = passes.length > 0;
  for (const pass of passes) {
    const section = document.createElement("section");
    section.className = "code";
    const name = document.createElement("h2");
    name.textContent = `${pass.firstName} · ${pass.ageGroup}s`;
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
}

document.getElementById("retry")?.addEventListener("click", () => location.reload());
void draw();
