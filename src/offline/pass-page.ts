// The script of the offline attendance QR page (public/offline-pass.html), which the service worker shows for
// /pass and /friday when there's no signal. Built into public/offline-pass.js by `npm run offline`
// (scripts/build-offline.mjs) with the same QR library the app uses. Draws the codes saved on this phone
// (src/lib/pass/cache.ts), and the parent's own sports hub entry code saved with them; the page itself holds no one's data.

import { groupPlural } from "../lib/domain";
import { phoneStorage, readHubCache, readPassCache } from "../lib/pass/cache";
import { qrDataUrl } from "../lib/qr-picture";

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
    try {
      // The same picture /pass draws on the server.
      picture.append(qrImage(await qrDataUrl(pass.token), `QR code that checks ${pass.firstName} in`));
    } catch {
      // Never a code missing without a word, at the gate with no signal.
      const missing = document.createElement("p");
      missing.textContent = `Couldn't show ${pass.firstName}'s code here. Ask the coach to mark ${pass.firstName} here.`;
      section.append(name, missing);
      list.append(section);
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
    try {
      picture.append(qrImage(await qrDataUrl(hub.text), "Your sports hub entry QR code"));
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

function qrImage(src: string, alt: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.className = "code-picture";
  return img;
}

document.getElementById("retry")?.addEventListener("click", () => location.reload());
void draw();
