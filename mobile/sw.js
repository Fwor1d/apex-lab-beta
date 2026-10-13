const VERSION = "0.5.0-cache15";
const PREFIX = `apex-lab:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const ASSETS = [
  "./workspace.css",
  "./src/workspace-ui.js",

  "./",
  "./index.html",
  "./styles.css",
  "./assets/shell.css",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./data/circuits.js",
  "./data/sebring/centerline.js",
  "./data/sebring/centerline.geojson",
  "./data/sebring/NOTICE.txt",
  "./src/app.js",
  "./src/bootstrap.js",
  "./src/state.js",
  "./src/model.js",
  "./src/driving-profile.js",
  "./src/trajectory.js",
  "./src/profile-contract.js",
  "./src/geometry.js",
  "./src/renderer.js",
  "./src/track-map.js",
  "./src/full-track-view.js",
  "./src/visual-tokens.js",
  "./src/charts.js",
  "./src/offline.js",
];
const assetUrls = ASSETS.map(
  (asset) => new URL(asset, self.registration.scope).href,
);
self.addEventListener("install", (event) => {
  // Atomic installation: a missing module fails the install instead of partial offline readiness.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
  if (event.data?.type === "CACHE_STATUS")
    event.waitUntil(
      caches.open(CACHE).then(async (cache) => {
        const entries = await Promise.all(
          assetUrls.map((url) => cache.match(url)),
        );
        event.ports[0]?.postMessage({
          ready: entries.every(Boolean),
          version: VERSION,
        });
      }),
    );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope)
  )
    return;
  // Only the static allowlist is stored. Personal/imported data is never cached by this worker.
  if (!assetUrls.includes(url.href)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) =>
        cache
          .match(event.request)
          .then((cached) => cached || fetch(event.request)),
      ),
  );
});
