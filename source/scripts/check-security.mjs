import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root = path.resolve(import.meta.dirname, ".."),
  manifest = JSON.parse(
    await fs.readFile(path.join(root, "docs/SOURCE-PROVENANCE.json")),
  );
for (const x of manifest.copies.filter(
  (x) =>
    x.destination.startsWith("engine/") &&
    !x.destination.startsWith("engine/tests/"),
)) {
  const hash = createHash("sha256")
    .update(await fs.readFile(path.join(root, x.destination)))
    .digest("hex");
  assert.equal(hash, x.sha256, "Production engine changed: " + x.destination);
}
const index = await fs.readFile(path.join(root, "app/index.html"), "utf8");
assert.ok(index.includes("connect-src 'self'"));
assert.ok(index.includes("worker-src 'self'"));
assert.ok(!/<script[^>]+src=["']https?:/.test(index));
const files = await fs.readdir(path.join(root, "app"));
for (const f of files.filter((f) => f.endsWith(".js"))) {
  const s = await fs.readFile(path.join(root, "app", f), "utf8");
  assert.ok(
    !/from ['"].*(?:demo-model|demo-source|model\.js|demo-analysis)/.test(s),
    f + " bypasses source facade",
  );
  assert.ok(
    !/new Worker|indexedDB|navigator\.sendBeacon|WebSocket/.test(s),
    f + " starts unauthorized service",
  );
}
assert.ok(!(await fs.readdir(path.join(root, "app"))).includes("model.js"));
console.log(
  "Security/architecture boundary verified; production engine hashes unchanged.",
);

// Phase 2 may invoke only the preserved native open path. No persistence or second Worker owner in adapters.
for (const directory of ["app/core", "app/data"]) {
  for (const entry of await fs.readdir(path.join(root, directory))) {
    if (!entry.endsWith(".js")) continue;
    const relative = directory + "/" + entry,
      source = await fs.readFile(path.join(root, relative), "utf8");
    assert.ok(
      !/new Worker|indexedDB|localStorage|sessionStorage|navigator\.sendBeacon|WebSocket|fetch\s*\(|getDirectory\s*\(/.test(
        source,
      ),
      relative + " starts unauthorized storage or service",
    );
    if (relative !== "app/data/recording-source.js")
      assert.ok(
        !source.includes("AnalyzerWorker"),
        relative + " creates a second native owner",
      );
  }
}
const adapter = await fs.readFile(
  path.join(root, "app/data/recording-source.js"),
  "utf8",
);
const actions = [...adapter.matchAll(/\.call\(\s*['"]([^'"]+)['"]/g)].map(
  (m) => m[1],
);
assert.deepEqual(
  actions,
  ["open"],
  "Phase 2 must not expose later-phase Worker actions",
);
assert.match(adapter, /method:\s*['"]handle['"]/);
console.log(
  "Phase 2 adapter: one native owner, open/FileHandle only, no private persistence or remote API.",
);
