// Explicit, static-only offline cache. Never store personal files or reports.
const VERSION = "0.8.0-beta.1-cache1";
const PREFIX = `apex-browser:${self.registration.scope}:`;
const LIGHT_CACHE = `${PREFIX}${VERSION}:light`;
const ASSETS = [
  "../mobile/workspace.css",
  "../mobile/src/workspace-ui.js",

  "./",
  "./index.html",
  "./styles.css",
  "./src/app.js",
  "./src/charts.js",
  "./src/map-context.js",
  "./src/atlas.js",
  "./data/atlas/manifest.json",
  "./data/atlas/NOTICE.txt",
  "./data/algarve/gp-outline.geojson",
  "./data/algarve/NOTICE.txt",
  "../mobile/src/full-track-view.js",
  "../mobile/src/geometry.js",
  "./src/client.js",
  "./src/report.js",
  "./src/report-worker.js",
  "./src/analysis.js",
  "./src/findings-view.js",
  "./src/coaching-engine.js",
  "./src/coaching-view.js",
  "./src/offline.js",
  "../mobile/src/profile-contract.js",
  "./assets/shell.css",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon.svg",
  "./assets/chevron.svg",
];
const NATIVE_COMMON = [
  "./src/worker.js",
  "./src/engine.js",
  "./src/importer.js",
  "./vendor/duckdb.js",
  "./vendor/hash.js",
];
const BUNDLES = {
  eh: ["./vendor/duckdb-eh.wasm", "./vendor/duckdb-browser-eh.worker.js"],
  mvp: ["./vendor/duckdb-mvp.wasm", "./vendor/duckdb-browser-mvp.worker.js"],
};
const url = (file) => new URL(file, self.registration.scope).href;
const allowed = new Set(
  [...ASSETS, ...NATIVE_COMMON, ...Object.values(BUNDLES).flat()].map(url),
);
const nativeCache = (bundle) => `${PREFIX}${VERSION}:native-${bundle}`;
let work = Promise.resolve();

async function prepare(name, files) {
  const cache = await caches.open(name);
  if (
    (await Promise.all(files.map((file) => cache.match(url(file))))).every(
      Boolean,
    )
  )
    return;
  // addAll is atomic: failed network/quota does not replace previous resources.
  await cache.addAll(
    files.map((file) => new Request(url(file), { cache: "reload" })),
  );
}

async function removeLegacyResources() {
  // Phase 4.5 used a global cache name. Remove only this route's entries;
  // another base path or the shared mobile contract must remain untouched.
  for (const name of await caches.keys()) {
    if (!name.startsWith("apex-browser-0.1.0-cache")) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys())
      if (request.url.startsWith(self.registration.scope))
        await cache.delete(request);
    if (!(await cache.keys()).length) await caches.delete(name);
  }
}

self.addEventListener("install", (event) => {
  // Registration is requested only by the explicit preparation button.
  event.waitUntil(prepare(LIGHT_CACHE, ASSETS));
  // An update waits for user action; do not replace a live client's version.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(PREFIX) && !name.startsWith(`${PREFIX}${VERSION}:`))
          await caches.delete(name);
      await removeLegacyResources();
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  const { action, bundle } = event.data ?? {};
  if (
    !["cache", "cache-native", "apply-update", "clear-cache"].includes(action)
  )
    return;
  const reply = (data) => event.ports[0]?.postMessage(data);
  const task = work
    .catch(() => {})
    .then(async () => {
      try {
        if (action === "apply-update") {
          reply({ ok: true });
          await self.skipWaiting();
          return;
        }
        if (action === "clear-cache") {
          for (const name of await caches.keys())
            if (name.startsWith(PREFIX)) await caches.delete(name);
          await removeLegacyResources();
          await self.registration.unregister();
          reply({ ok: true });
          return;
        }
        if (action === "cache-native") {
          if (!Object.hasOwn(BUNDLES, bundle))
            throw Error("unsupported bundle");
          await prepare(nativeCache(bundle), [
            ...NATIVE_COMMON,
            ...BUNDLES[bundle],
          ]);
          for (const other of Object.keys(BUNDLES))
            if (other !== bundle) await caches.delete(nativeCache(other));
        } else await prepare(LIGHT_CACHE, ASSETS);
        reply({
          ok: true,
          version: VERSION,
          bundle: action === "cache-native" ? bundle : null,
        });
      } catch {
        reply({
          ok: false,
          error:
            "Кеш не подготовлен: проверьте сеть и свободное место. Прежний кеш сохранён; повторите попытку.",
        });
      }
    });
  work = task;
  event.waitUntil(task);
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !allowed.has(event.request.url)) return;
  event.respondWith(
    (async () => {
      for (const name of [LIGHT_CACHE, nativeCache("eh"), nativeCache("mvp")]) {
        const response = await caches.match(event.request, { cacheName: name });
        if (response) return response;
      }
      return fetch(event.request);
    })(),
  );
});
