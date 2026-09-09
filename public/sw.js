// Bump this string to force every client to drop the old asset cache on
// the next activate. Only immutable, content-hashed build output and the
// PWA icons are ever stored here — never HTML and never /api responses —
// so a stale cache can't serve out-of-date data or a wrong app version.
const ASSET_CACHE = "day-assets-v1";
const CACHED_PREFIXES = ["/_next/static/", "/icons/"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== ASSET_CACHE).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// Cache-first for hashed build assets and icons: these URLs change
// whenever their contents do, so a cache hit is always correct and saves
// re-downloading megabytes of JS/CSS on every cold open — the main win on
// a slow connection. Everything else (HTML navigations, /api/*, anything
// cross-origin) is left completely untouched and always hits the network.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Reminder", body: "" , url: "/"};
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
