const PREFIX = `apex-home:${self.registration.scope}:`,
  CACHE = PREFIX + "0.8.0-beta.2-cache1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/shell.css",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];
const allowed = new Set(
  ASSETS.map((file) => new URL(file, self.registration.scope).href),
);
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .catch(async (e) => {
        await caches.delete(CACHE);
        throw e;
      }),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(PREFIX) && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !allowed.has(event.request.url)) return;
  event.respondWith(
    (async () => {
      return (
        (await (await caches.open(CACHE)).match(event.request)) ||
        fetch(event.request)
      );
    })(),
  );
});
