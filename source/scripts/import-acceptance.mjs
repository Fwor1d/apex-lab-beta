import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "./serve.mjs";
import { generateNativeFixture } from "../tests/fixtures/native-recording.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  engine = process.env.APEX_BROWSER === "webkit" ? "webkit" : "chromium";
const out = path.join(root, "evidence/phase2", engine),
  profile = path.join(root, "tmp", "phase2-browser-" + engine);
await fs.mkdir(out, { recursive: true });
await fs.mkdir(path.join(root, "tmp"), { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, ".cache/playwright");
const playwright = await import("playwright");
const server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`,
  base = "/apex-lab/";
const context = await playwright[engine].launchPersistentContext(profile, {
  ...(engine === "chromium" && process.env.APEX_BROWSER_CHANNEL
    ? { channel: process.env.APEX_BROWSER_CHANNEL }
    : {}),
  headless: true,
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  acceptDownloads: false,
  env: { ...process.env, TMPDIR: path.join(root, "tmp") },
  ...(engine === "chromium" ? { args: ["--disable-crash-reporter"] } : {}),
});
const report = {
  engine,
  checks: [],
  errors: [],
  injectedFaultErrors: [],
  prohibitedRequests: [],
  records: [],
  screenshots: [],
  privateValidation:
    "skipped: opt in with APEX_REAL_BROWSER and private input paths",
  oracle: "skipped: private oracle not configured",
};
context.on("request", (r) => {
  const u = r.url();
  if (
    (!u.startsWith(origin + "/") &&
      !u.startsWith("blob:" + origin + "/") &&
      !u.startsWith("data:")) ||
    r.method() !== "GET" ||
    r.postData() ||
    new URL(u).search
  )
    report.prohibitedRequests.push({
      method: r.method(),
      kind: "non-local or non-GET request",
    });
});
await context.route("**/*", (r) =>
  r
    .request()
    .url()
    .startsWith(origin + "/") ||
  r
    .request()
    .url()
    .startsWith("blob:" + origin + "/")
    ? r.continue()
    : r.abort(),
);
await context.addInitScript(() => {
  localStorage.setItem("apex-motion", "off");
  sessionStorage.setItem("apex-startup-r4", "1");
  window.__workers = [];
  window.__workerErrors = [];
  const Original = Worker;
  window.Worker = class extends Original {
    constructor(url, ...args) {
      super(url, ...args);
      this.entry = { url: String(url), active: true };
      window.__workers.push(this.entry);
      this.addEventListener("message", (e) => {
        if (e.data.error) window.__workerErrors.push(e.data.error);
      });
    }
    terminate() {
      this.entry.active = false;
      super.terminate();
    }
  };
  window.__importStates = [];
});
let injectedFault = null;
const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultTimeout(20000);
page.on("pageerror", (e) => {
  if (injectedFault && e.message === "Failed to fetch")
    report.injectedFaultErrors.push({
      fault: injectedFault,
      message: e.message,
    });
  else report.errors.push(e.message);
});
const state = () =>
  page.evaluate(async () =>
    (await import("./core/context.js")).appStore.snapshot(),
  );
const check = async (name, fn) => {
  await fn();
  report.checks.push(name);
  console.log("PASS " + name);
};
const activeWorkers = () =>
  page.evaluate(
    () =>
      window.__workers.filter(
        (w) => w.active && w.url.endsWith("/src/worker.js"),
      ).length,
  );
async function modal() {
  if (!(await page.locator("#import-dialog").isVisible())) {
    if (!(await page.locator('[data-action="import"]:visible').count()))
      await page.goto(new URL("#sessions", page.url()).href);
    await page.locator('[data-action="import"]:visible').first().click();
  }
}
async function waitImport(afterGeneration = -1) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const s = await state();
    if (
      s.generation > afterGeneration &&
      !["idle", "validating", "importing"].includes(s.importStatus.phase)
    )
      return s;
    await page.waitForTimeout(40);
  }
  throw Error("Import did not settle");
}
async function openFile(file) {
  await modal();
  const before = (await state()).generation;
  await page.locator("#recording-file").setInputFiles(file);
  return waitImport(before);
}
async function closeModal() {
  if (await page.locator("#import-dialog").isVisible())
    await page.locator("#close-dialog").click();
}
async function demo() {
  await modal();
  await page.locator("#load-demo").click();
  assert.equal((await state()).source.mode, "demo");
}
async function shot(name) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: path.join(out, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(name + ".png");
}
async function isolated() {
  const s = await state();
  assert.equal(s.cursorM, null);
  assert.equal(s.playback.timeS, null);
  assert.equal(s.playback.playing, false);
  assert.equal(
    await page
      .locator(
        'main canvas, main #map, main .plot, main input[type=range], main #play, main [data-action="export"]',
      )
      .count(),
    0,
  );
}
try {
  await page.goto(origin + base + "#sessions");
  await page.evaluate(async () => {
    const { appStore } = await import("./core/context.js");
    appStore.subscribe((s) => {
      window.__importStates.push({
        phase: s.importStatus.phase,
        stage: s.importStatus.stage,
        fraction: s.importStatus.fraction,
      });
    });
  });
  await check("DEMO opens without native Worker or Wasm", async () => {
    assert.equal(await activeWorkers(), 0);
    assert.equal(
      await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .some((r) => r.name.endsWith(".wasm")),
      ),
      false,
    );
  });
  const native = Buffer.from(
    await generateNativeFixture({ directory: path.join(root, "tmp") }),
  );
  const file = {
    name: "synthetic.duckdb",
    mimeType: "application/octet-stream",
    buffer: native,
  };
  await check(
    "Wrong extension and invalid header are rejected before native Worker",
    async () => {
      let s = await openFile({
        name: "wrong.zip",
        mimeType: "application/zip",
        buffer: Buffer.from("PK"),
      });
      assert.equal(s.importStatus.error.code, "EXTENSION");
      s = await openFile({
        name: "bad.duckdb",
        mimeType: "application/octet-stream",
        buffer: Buffer.alloc(12288),
      });
      assert.equal(s.importStatus.error.code, "HEADER");
      assert.equal(await activeWorkers(), 0);
    },
  );
  await check(
    "Actual Wasm native import via picker, honest synthetic label and metadata escaping",
    async () => {
      const s = await openFile(file);
      assert.equal(
        s.importStatus.phase,
        "ready",
        JSON.stringify(await page.evaluate(() => window.__workerErrors)),
      );
      assert.equal(s.loaded, true);
      assert.equal(s.source.kind, "synthetic");
      assert.equal(s.source.laps.length, 3);
      assert.equal(s.source.provenance.engineReleased, true);
      assert.equal(s.pair, null);
      assert.equal(JSON.stringify(s).includes("PRIVATE TEST SENTINEL"), false);
      assert.equal(
        s.source.channels.find((c) => c.id === "steeringNormalized")
          .normalizedStatus,
        "unavailable",
      );
      await closeModal();
      assert.equal(await page.locator("main img").count(), 0);
      assert.ok(
        (await page.locator("main").innerText()).includes("<img src=x"),
      );
      assert.equal(await activeWorkers(), 1);
      const events = await page.evaluate(() => window.__importStates);
      assert.ok(events.some((e) => e.stage === "hash"));
      assert.ok(events.some((e) => e.stage === "laps"));
      assert.ok(events.every((e) => e.fraction === null));
    },
  );
  await check(
    "All laps inspectable; REAL file mode never renders synthetic analysis",
    async () => {
      await page.locator('[data-inspect-lap="0"]').click();
      assert.equal((await state()).selectedLapId, "0");
      for (const route of [
        "dashboard",
        "telemetry",
        "atlas",
        "lab",
        "reports",
      ]) {
        await page.goto(origin + base + "#" + route);
        await isolated();
      }
      await page.goto(origin + base + "#telemetry");
      for (const mode of ["map", "pitwall", "advanced", "setup", "overview"]) {
        await page.locator('[data-mode="' + mode + '"]').click();
        await isolated();
      }
    },
  );
  await check(
    "Explicit DEMO switch releases native Worker and restores R5.2 Track Map",
    async () => {
      await demo();
      assert.equal(await activeWorkers(), 0);
      await page.locator('[data-mode="map"]').first().click();
      await page.locator("#map").waitFor();
      assert.equal((await state()).source.kind, "synthetic");
      await page.locator("#cursor").fill("1234");
      assert.equal((await state()).cursorM, 1234);
    },
  );
  await check(
    "Cancel during Worker loading, no late session; retry and repeated replacement release resources",
    async () => {
      await page.route(
        "**/engine/apps/browser-telemetry/src/worker.js",
        async (r) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await r.continue().catch(() => {});
        },
      );
      for (let i = 0; i < 3; i++) {
        await modal();
        await page.locator("#recording-file").setInputFiles(file);
        await page.locator("#cancel-import").click();
        assert.equal((await state()).importStatus.phase, "cancelled");
        assert.equal(await activeWorkers(), 0);
      }
      await page.waitForTimeout(600);
      assert.equal((await state()).source.id, null);
      await page.unroute("**/engine/apps/browser-telemetry/src/worker.js");
      const beforeRetry = (await state()).generation;
      await page.locator("#retry-import").click();
      assert.equal((await waitImport(beforeRetry)).loaded, true);
      assert.equal(await activeWorkers(), 1);
      await openFile(file);
      assert.equal(await activeWorkers(), 1);
      await closeModal();
      await page.locator('[data-action="release-recording"]').click();
      assert.equal(await activeWorkers(), 0);
      assert.equal((await state()).loaded, false);
    },
  );
  const badSchema = Buffer.from(
    await generateNativeFixture({
      directory: path.join(root, "tmp"),
      mutation: "UPDATE metadata SET value='999' WHERE key='Version'",
    }),
  );
  await check(
    "Unsupported LMU version fails clearly and releases Worker",
    async () => {
      const s = await openFile({ ...file, buffer: badSchema });
      assert.equal(s.importStatus.error.code, "SCHEMA");
      assert.equal(s.loaded, false);
      assert.equal(await activeWorkers(), 0);
    },
  );
  const missingClock = Buffer.from(
    await generateNativeFixture({
      directory: path.join(root, "tmp"),
      mutation: 'DROP TABLE "GPS Time"',
    }),
  );
  await check(
    "Missing required clock is a partial imported session with zero profiles",
    async () => {
      const s = await openFile({ ...file, buffer: missingClock });
      assert.equal(s.importStatus.phase, "partial");
      assert.equal(s.loaded, true);
      assert.equal(s.source.laps.length, 0);
      assert.equal(
        s.source.channels.find((c) => c.id === "timeS").normalizedStatus,
        "unavailable",
      );
    },
  );
  await check(
    "Corrupted DuckDB is rejected safely with no previous session",
    async () => {
      const b = Buffer.alloc(12288);
      b.write("DUCK", 8);
      const s = await openFile({ ...file, buffer: b });
      assert.equal(s.importStatus.phase, "failed");
      assert.equal(s.importStatus.error.code, "DATABASE");
      assert.equal(s.loaded, false);
      assert.equal(s.source.id, null);
      assert.equal(await activeWorkers(), 0);
    },
  );
  await check(
    "Worker and Wasm initialization failures are recoverable",
    async () => {
      await page.route("**/engine/apps/browser-telemetry/src/worker.js", (r) =>
        r.abort(),
      );
      let s = await openFile(file);
      assert.equal(s.importStatus.error.code, "WORKER");
      await page.unroute("**/engine/apps/browser-telemetry/src/worker.js");
      injectedFault = "blocked local Wasm asset";
      await page.route("**/*.wasm", (r) => r.abort());
      s = await openFile(file);
      assert.equal(s.importStatus.error.code, "TIMEOUT");
      assert.equal(await activeWorkers(), 0);
      await page.unroute("**/*.wasm");
      injectedFault = null;
      assert.equal((await openFile(file)).loaded, true);
      await closeModal();
    },
  );
  await check(
    "Four responsive viewports, 44px controls, readable text and no overflow",
    async () => {
      await page.evaluate(() => {
        location.hash = "sessions";
      });
      await page.locator(".imported-session").waitFor();
      assert.equal((await state()).loaded, true);
      for (const [width, height] of [
        [1440, 900],
        [390, 844],
        [844, 390],
        [768, 1024],
      ]) {
        await page.setViewportSize({ width, height });
        const metrics = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          small: [
            ...document.querySelectorAll(
              "main button, main label, main summary, main p",
            ),
          ].filter(
            (e) =>
              e.getClientRects().length &&
              parseFloat(getComputedStyle(e).fontSize) < 11,
          ).length,
          short: [...document.querySelectorAll("main button, main select")]
            .filter(
              (e) =>
                e.getClientRects().length &&
                e.getBoundingClientRect().height < 44,
            )
            .map((e) => e.id || e.textContent),
        }));
        assert.ok(metrics.scroll <= width, JSON.stringify(metrics));
        assert.equal(metrics.small, 0);
        assert.deepEqual(metrics.short, []);
        await shot("sessions-" + width);
        await modal();
        await shot("import-" + width);
        await closeModal();
      }
    },
  );
  if (process.env.APEX_REAL_BROWSER === "1") {
    assert.ok(
      process.env.APEX_AUDIT_ROOT && process.env.APEX_LMU_DATA_ROOT,
      "Private opt-in requires existing audit and read-only dataset roots",
    );
    const audit = JSON.parse(
      await fs.readFile(
        path.join(process.env.APEX_AUDIT_ROOT, "evidence/database-audit.json"),
      ),
    );
    const baseline = JSON.parse(
      await fs.readFile(
        path.join(
          process.env.APEX_AUDIT_ROOT,
          "evidence/browser-native-audit.json",
        ),
      ),
    );
    let oracle = [];
    if (process.env.APEX_BROWSER_ORACLE) {
      oracle = JSON.parse(
        await fs.readFile(
          path.join(process.env.APEX_BROWSER_ORACLE, "manifest.json"),
        ),
      );
      report.oracle = "passed: independent Python lap validation";
    }
    for (const record of audit.records) {
      await check(
        "Private " +
          record.alias +
          ": picker → Worker → adapter → Sessions, baseline parity",
        async () => {
          await page.setViewportSize({ width: 1440, height: 900 });
          const source = path.join(process.env.APEX_LMU_DATA_ROOT, record.path);
          const hash = async () =>
            createHash("sha256")
              .update(await fs.readFile(source))
              .digest("hex");
          assert.equal(await hash(), record.sha256);
          const s = await openFile(source),
            expected = baseline.records.find((r) => r.alias === record.alias);
          assert.ok(["ready", "partial"].includes(s.importStatus.phase));
          assert.equal(s.loaded, true);
          assert.equal(s.source.kind, "telemetry-derived");
          assert.equal(s.source.id, expected.id);
          assert.equal(s.source.recording.sha256, record.sha256);
          assert.equal(s.source.laps.length, expected.laps.length);
          for (const l of s.source.laps) {
            const b = expected.laps.find((x) => x.lapId === l.id);
            assert.deepEqual(l.validation, b.validation);
            assert.equal(l.certified_valid, b.certified_valid);
            assert.equal(l.source_verified, b.source_verified);
          }
          const fields = {
            track: "TrackName",
            layout: "TrackLayout",
            car: "CarName",
            carClass: "CarClass",
            sessionType: "SessionType",
            recordingUTC: "recordingUTC",
          };
          for (const [k, v] of Object.entries(fields))
            assert.equal(s.source.metadata[k], expected.metadata[v] ?? null);
          const eligible = s.source.laps
            .filter((l) => l.certified_valid)
            .map((l) => l.id);
          assert.deepEqual(
            eligible,
            expected.laps.filter((l) => l.certified_valid).map((l) => l.lapId),
          );
          if (oracle.length) {
            const entry = oracle.find((o) => o.alias === record.alias),
              ref = JSON.parse(await fs.readFile(entry.oracle));
            assert.equal(ref.sessionId, s.source.id);
            assert.equal(ref.laps.length, s.source.laps.length);
            for (const l of s.source.laps) {
              const refLap = ref.laps.find(
                (x) => x.profile.provenance.lapId === l.id,
              );
              assert.deepEqual(l.validation, refLap.validation);
              assert.equal(l.source_verified, refLap.sourceVerified);
            }
          }
          await closeModal();
          assert.equal(
            await page.locator(".lap-row").count(),
            s.source.laps.length,
          );
          if (eligible.length >= 2) {
            await page.locator("#real-lap-a").selectOption(eligible[0]);
            await page.locator("#real-lap-b").selectOption(eligible[1]);
            assert.deepEqual((await state()).pair, {
              sessionId: s.source.id,
              a: eligible[0],
              b: eligible[1],
            });
            await page.locator("#swap-real-pair").click();
            assert.deepEqual((await state()).pair, {
              sessionId: s.source.id,
              a: eligible[1],
              b: eligible[0],
            });
            await page.locator("#swap-real-pair").click();
            for (const [width, height] of [
              [1440, 900],
              [390, 844],
              [844, 390],
              [768, 1024],
            ]) {
              await page.setViewportSize({ width, height });
              const controls = await page
                .locator(".real-pair select")
                .evaluateAll((es) =>
                  es.map((e) => e.getBoundingClientRect().height),
                );
              assert.ok(
                controls.every((h) => h >= 44),
                JSON.stringify(controls),
              );
            }
            await page.setViewportSize({ width: 1440, height: 900 });
          } else {
            assert.equal(s.pair, null);
            assert.equal(await page.locator("#real-lap-a").count(), 0);
          }
          for (const l of s.source.laps) {
            await page.locator('[data-inspect-lap="' + l.id + '"]').click();
            assert.equal((await state()).selectedLapId, l.id);
          }
          await isolated();
          assert.equal(await activeWorkers(), 1);
          assert.equal(s.source.provenance.engineReleased, true);
          assert.equal(await hash(), record.sha256);
          report.records.push({
            alias: record.alias,
            status: s.importStatus.phase,
            laps: s.source.laps.length,
            eligible,
            baselineParity: true,
            independentOracle: oracle.length ? "passed" : "skipped",
            sourceUnchanged: true,
          });
          if (record.alias === "S2") await shot("private-S2");
        },
      );
    }
    report.privateValidation = "passed";
  }
  await check(
    "Source cleanup on pagehide and private storage remains empty",
    async () => {
      await closeModal();
      await page.evaluate(() => {
        dispatchEvent(new PageTransitionEvent("pagehide"));
        dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      });
      assert.equal(await activeWorkers(), 0);
      assert.equal((await state()).loaded, false);
      const storage = await page.evaluate(async () => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
        caches: await caches.keys(),
        databases:
          typeof indexedDB.databases === "function"
            ? (await indexedDB.databases()).map((d) => d.name)
            : [],
        workers: (await navigator.serviceWorker.getRegistrations()).length,
      }));
      assert.deepEqual(storage.local, ["apex-motion"]);
      assert.deepEqual(storage.session, ["apex-startup-r4"]);
      assert.deepEqual(storage.caches, []);
      assert.deepEqual(storage.databases, []);
      assert.equal(storage.workers, 0);
    },
  );
  await check(
    "Root base supports native import using relative Worker assets",
    async () => {
      await page.goto(origin + "/#sessions");
      const s = await openFile(file);
      assert.equal(s.loaded, true);
      assert.equal(s.source.kind, "synthetic");
      await demo();
      assert.equal(await activeWorkers(), 0);
    },
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.prohibitedRequests, []);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = String(error);
  process.exitCode = 1;
  console.error(error);
  await shot("failure").catch(() => {});
} finally {
  await context.close();
  await new Promise((r) => server.close(r));
  await fs.rm(profile, { recursive: true, force: true });
  await fs.writeFile(
    path.join(out, "import-acceptance.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.length,
      records: report.records,
      errors: report.errors.length,
      prohibitedRequests: report.prohibitedRequests.length,
    }),
  );
}
