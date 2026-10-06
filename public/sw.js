// Deen Squad service worker: shows the club's notifications and opens the app when one is tapped, and shows the
// attendance QR codes saved on the phone when /pass or /friday can't load (no signal at the gate).
//
// Offline, deliberately narrow: only page loads (navigations) of /pass and /friday are touched. They always go to
// the network first; only if that fails is the static /offline-pass.html shown instead (it holds no one's data:
// its script draws the codes saved in this phone's localStorage). The only things ever cached are that page and
// its script. Every other request (other pages, /api, Next's files) passes straight through, untouched.
// Bump VERSION whenever offline-pass.html or offline-pass.js change (npm run offline), so phones fetch them again.

const VERSION = "2";
const OFFLINE_CACHE = `ds-offline-v${VERSION}`;
const OFFLINE_PAGE = "/offline-pass.html";
const OFFLINE_FILES = [OFFLINE_PAGE, "/offline-pass.js"];
const OFFLINE_PATHS = ["/pass", "/friday"];

/** Puts any missing offline file in the cache. Never throws: without them the browser's own offline page shows. */
async function cacheOfflineFiles() {
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    for (const path of OFFLINE_FILES) {
      if (await cache.match(path)) continue;
      const response = await fetch(path, { cache: "reload", credentials: "omit", redirect: "error" });
      if (response.ok && response.type === "basic") await cache.put(path, response);
    }
  } catch {}
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflineFiles());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        for (const key of await caches.keys()) if (key.startsWith("ds-offline-") && key !== OFFLINE_CACHE) await caches.delete(key);
      } catch {}
      await self.clients.claim();
    })(),
  );
});

async function offlinePage() {
  try {
    const page = await caches.match(OFFLINE_PAGE, { cacheName: OFFLINE_CACHE });
    if (page) return page;
  } catch {}
  return Response.error();
}

self.addEventListener("fetch", (event) => {
  let kind = null;
  try {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    if (request.mode === "navigate" && OFFLINE_PATHS.includes(url.pathname)) kind = "page";
    else if (OFFLINE_FILES.includes(url.pathname) && url.pathname !== OFFLINE_PAGE) kind = "file";
  } catch {
    return; // anything unexpected: leave the request to the browser
  }
  if (kind === "page") {
    // Network first, always. Only a failed load (no signal) gets the offline page.
    event.respondWith(
      fetch(event.request).then(
        (response) => {
          event.waitUntil(cacheOfflineFiles());
          return response;
        },
        () => offlinePage(),
      ),
    );
  } else if (kind === "file") {
    // The offline page's own script: the cached copy (it only loads when the offline page is showing).
    event.respondWith(
      caches
        .match(event.request.url, { cacheName: OFFLINE_CACHE, ignoreSearch: true })
        .catch(() => undefined)
        .then((cached) => cached || fetch(event.request)),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Deen Squad", body: "There's a new message from the club.", url: "/news" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/news", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
