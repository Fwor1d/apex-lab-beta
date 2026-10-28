import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "./serve.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  engine = process.env.APEX_BROWSER === "webkit" ? "webkit" : "chromium";
const out = path.join(root, "evidence/phase3", engine),
  profile = path.join(root, "tmp", "phase3-browser-" + engine);
await fs.mkdir(out, { recursive: true });
await fs.mkdir(path.join(root, "tmp"), { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, ".cache/playwright");
const playwright = await import("playwright"),
  server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`,
  base = "/apex-lab/";
const context = await playwright[engine].launchPersistentContext(profile, {
  headless: true,
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  acceptDownloads: false,
  env: { ...process.env, TMPDIR: path.join(root, "tmp") },
  ...(engine === "chromium" && process.env.APEX_BROWSER_CHANNEL
    ? { channel: process.env.APEX_BROWSER_CHANNEL }
    : {}),
});
const report = {
  engine,
  checks: [],
  errors: [],
  prohibitedRequests: [],
  screenshots: [],
  records: [],
  performance: [],
  privateOracle: "skipped: private opt-in not configured",
};
context.on("request", (r) => {
  const u = r.url();
  if (
    (!u.startsWith(origin + "/") && !u.startsWith("blob:" + origin + "/")) ||
    r.method() !== "GET" ||
    r.postData() ||
    new URL(u).search
  )
    report.prohibitedRequests.push("non-local/non-GET/payload");
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
// Only these two public test modules are exposed by the harness, never by the application.
for (const name of ["analysis-source.mjs", "session-summary.mjs"]) {
  const contents = (
    await fs.readFile(path.join(root, "tests/fixtures", name), "utf8")
  )
    .replaceAll("../../app/", "../")
    .replaceAll("../../engine/", "../engine/");
  await context.route(origin + base + "__test/" + name, (r) =>
    r.fulfill({ contentType: "text/javascript", body: contents }),
  );
}
await context.addInitScript(() => {
  localStorage.setItem("apex-motion", "off");
  sessionStorage.setItem("apex-startup-r4", "1");
  window.__workers = [];
  window.__actions = [];
  const Original = Worker;
  window.Worker = class extends Original {
    constructor(...args) {
      super(...args);
      this.entry = { active: true };
      window.__workers.push(this.entry);
    }
    postMessage(data, ...args) {
      window.__actions.push(data.action);
      super.postMessage(data, ...args);
    }
    terminate() {
      this.entry.active = false;
      super.terminate();
    }
  };
});
const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultTimeout(20000);
page.on("pageerror", (e) => report.errors.push(e.message));
const state = () =>
  page.evaluate(async () =>
    (await import("./core/context.js")).appStore.snapshot(),
  );
const check = async (name, fn) => {
  await fn();
  report.checks.push(name);
  console.log("PASS " + name);
};
async function analysisSettled() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const s = await state();
    if (s.source.mode === "real" && s.analysisStatus.phase !== "pending")
      return s;
    await page.waitForTimeout(40);
  }
  throw Error("Analysis did not settle");
}
async function mode(value) {
  await page.locator(`[data-mode="${value}"]`).first().click();
  await page.waitForFunction(
    (v) => document.querySelector("main").classList.contains("mode-" + v),
    value,
  );
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
async function fixture(variant = "normal") {
  await page.evaluate(async (variant) => {
    const { appStore } = await import("./core/context.js"),
      { analysisFixture, duckFile } =
        await import("./__test/analysis-source.mjs");
    const mutation = (p) => {
      if (variant === "gaps") {
        p.samples[100].speedMps = null;
        p.samples[200].distanceM = null;
      }
      if (variant === "plateau")
        p.samples[100].distanceM = p.samples[99].distanceM;
      if (variant === "time-gap")
        for (let i = 500; i < p.samples.length; i++) p.samples[i].timeS += 1;
    };
    window.__releaseCompare = null;
    const f = analysisFixture({
      mutation,
      beforeCall: async (action) => {
        if (action === "compare" && variant === "failed")
          throw Error("TEST private diagnostic");
        if (action === "compare" && variant === "delayed")
          await new Promise((resolve) => (window.__releaseCompare = resolve));
      },
    });
    appStore.setSource(f.source);
    appStore.setImportStatus({ phase: "validating", message: "TEST" });
    appStore.setImportStatus({ phase: "importing", message: "TEST" });
    await f.source.open(duckFile());
    appStore.commitImportedSource();
    appStore.setImportStatus({
      phase: "ready",
      message: "Синтетический тест аналитического адаптера",
    });
    window.__fixture = f;
    location.hash = "telemetry";
  }, variant);
  if (variant !== "delayed") await analysisSettled();
}
async function seekDistance(value) {
  if (!(await page.locator(".real-precision").evaluate((e) => e.open))) {
    await page.locator(".real-precision summary").click();
  }
  await page.locator("#real-distance").fill(String(value));
  await page.locator("#real-distance").press("Tab");
}
async function responsive(prefix) {
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [768, 1024],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(70);
    if (width === 390) {
      const toggle = page.locator(".pair-toggle");
      if (
        (await toggle.isVisible()) &&
        !(await toggle.evaluate(
          (e) => e.getAttribute("aria-expanded") === "true",
        ))
      )
        await toggle.click();
      assert.ok(await page.locator("#real-lap-a").isVisible());
    }
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: [
        ...document.querySelectorAll(
          "main button, main label, main p, main summary, main text",
        ),
      ].filter(
        (e) =>
          e.getClientRects().length &&
          parseFloat(getComputedStyle(e).fontSize) < 11,
      ).length,
      short: [...document.querySelectorAll("main button, main select")]
        .filter(
          (e) =>
            e.getClientRects().length && e.getBoundingClientRect().height < 44,
        )
        .map((e) => e.id || e.textContent),
    }));
    assert.ok(metrics.overflow <= 0, JSON.stringify(metrics));
    assert.equal(metrics.small, 0);
    assert.deepEqual(metrics.short, []);
    await page.locator(".real-precision").evaluate((e) => (e.open = false));
    await shot(`${prefix}-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
async function assertCursor() {
  const r = await page.evaluate(async () => {
    const { appStore } = await import("./core/context.js"),
      s = appStore.state,
      source = appStore.source;
    return {
      distance: s.cursorM,
      time: s.playback.timeS,
      mapped: source.timeAt(s.b, s.cursorM),
      curves: [...document.querySelectorAll("[data-cursor]")].map((e) =>
        Number(e.dataset.distance),
      ),
      hud: document.querySelector("#hud-speed")?.textContent,
      speed: source.valueAt(s.b, s.cursorM)?.speedMps,
    };
  });
  assert.ok(Math.abs(r.time - r.mapped) <= 1e-10);
  assert.ok(r.curves.every((d) => d === r.distance));
  if (r.speed !== null)
    assert.ok(
      r.hud.includes(
        (r.speed * 3.6).toLocaleString("ru-RU", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      ),
    );
}
try {
  await page.goto(origin + base + "#telemetry");
  await check(
    "Synthetic profiles → protected compare → REAL adapter: Overview identity, units and delta",
    async () => {
      await fixture();
      await mode("overview");
      const s = await state();
      assert.equal(s.source.kind, "synthetic");
      assert.equal(s.analysisStatus.recordedDifferenceS, 1);
      assert.equal(s.analysisStatus.commonEndDeltaS, 1);
      assert.equal(
        s.analysisStatus.channels.steeringNormalized.b,
        "unavailable",
      );
      assert.ok((await page.locator("main").innerText()).includes("TEST"));
      assert.equal(await page.locator("#overview-map,#map").count(), 0);
      await seekDistance(123.456);
      assert.equal((await state()).cursorM, 123.456);
      await assertCursor();
    },
  );
  await check(
    "Overview responsive layout and native controls at five viewports",
    () => responsive("synthetic-overview"),
  );
  await check(
    "Pit Wall channel/series selection, cursor, zoom/pan/reset",
    async () => {
      await mode("pitwall");
      assert.equal(await page.locator(".real-plot").count(), 5);
      await assertCursor();
      await page.locator("#real-channel").selectOption("brake");
      assert.equal(
        await page.locator(".real-plot").first().getAttribute("data-channel"),
        "brake",
      );
      const pair = (await state()).pair;
      await page.locator("#real-series-a").uncheck();
      assert.equal(await page.locator("path[data-lap=a]").count(), 0);
      await page.locator("#real-series-a").check();
      await seekDistance(700.123);
      await page.locator("[data-real-range=zoom]").click();
      const zoom = (await state()).range;
      assert.ok(zoom[1] - zoom[0] < 2000);
      await page.locator("[data-real-range=right]").click();
      assert.ok((await state()).range[0] > zoom[0]);
      assert.deepEqual((await state()).pair, pair);
      await page.locator("[data-real-range=full]").click();
      assert.deepEqual((await state()).range, [0, 2000]);
    },
  );
  await check("Pit Wall responsive layout at five viewports", () =>
    responsive("synthetic-pitwall"),
  );
  await check(
    "One playback owner; view changes retain B time; paused HUD stays untouched",
    async () => {
      await seekDistance(700);
      const before = (await state()).playback.timeS;
      await page.locator("#play").click();
      await page.waitForTimeout(250);
      assert.ok((await state()).playback.timeS > before);
      await mode("overview");
      assert.equal((await state()).playback.playing, true);
      await page.waitForTimeout(120);
      await page.locator("#play").click();
      await assertCursor();
      const changes = await page.evaluate(async () => {
        let n = 0;
        const observer = new MutationObserver((m) => (n += m.length));
        observer.observe(document.querySelector(".real-hud"), {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });
        await new Promise((r) => setTimeout(r, 160));
        observer.disconnect();
        return n;
      });
      assert.equal(changes, 0);
      for (let i = 0; i < 3; i++) {
        await mode("pitwall");
        await mode("overview");
      }
      const t = (await state()).playback.timeS;
      await page.locator("#play").click();
      await page.waitForTimeout(300);
      await page.locator("#play").click();
      const elapsed = (await state()).playback.timeS - t;
      assert.ok(elapsed > 0 && elapsed < 0.65);
    },
  );
  await check(
    "Swap invalidates old pair and inverts B−A; real map stays unavailable",
    async () => {
      await page.locator("#swap-real-pair").click();
      await analysisSettled();
      const s = await state();
      assert.equal(s.a, "2");
      assert.equal(s.b, "1");
      assert.equal(s.analysisStatus.recordedDifferenceS, -1);
      assert.equal(s.analysisStatus.commonEndDeltaS, -1);
      assert.equal(s.playback.playing, false);
      await mode("map");
      assert.equal(await page.locator("#map,.plot,#play").count(), 0);
    },
  );
  await check(
    "Missing signals, gaps and plateau remain unavailable without zero-fill",
    async () => {
      await fixture("gaps");
      await mode("pitwall");
      assert.ok(
        Number(
          await page
            .locator("#plot-speed [data-lap=a]")
            .getAttribute("data-runs"),
        ) >= 3,
      );
      await seekDistance(398);
      const cursor = (await state()).cursorM;
      await page.locator(".real-precision").evaluate((e) => (e.open = false));
      await page.locator("#cursor").evaluate((e) => {
        e.value = "400";
        e.dispatchEvent(new Event("input", { bubbles: true }));
      });
      assert.equal((await state()).cursorM, cursor);
      assert.equal(
        await page.locator(".real-precision").evaluate((e) => e.open),
        true,
      );
      assert.equal(await page.locator("#real-seek-feedback").isVisible(), true);
      assert.ok(
        (await page.locator("#real-seek-feedback").innerText()).includes(
          "нет однозначной",
        ),
      );
      await fixture("plateau");
      await mode("pitwall");
      assert.equal((await state()).analysisStatus.coverage, 0);
      assert.equal(
        await page.locator("#plot-delta [data-lap=b]").getAttribute("d"),
        "",
      );
      assert.ok(
        (await page.locator("#hud-delta").innerText()).includes("Нет данных"),
      );
      await fixture("time-gap");
      assert.ok((await state()).analysisStatus.mapping.intervals > 1);
    },
  );
  await check(
    "Failure, cancel/retry and stale pair/source responses",
    async () => {
      await fixture("failed");
      assert.equal((await state()).analysisStatus.phase, "failed");
      assert.equal((await state()).loaded, true);
      assert.ok(
        !(await page.locator("main").innerText()).includes(
          "TEST private diagnostic",
        ),
      );
      await fixture("delayed");
      await page.waitForFunction(() => !!window.__releaseCompare);
      await page.locator("[data-real-analysis=cancel]").click();
      assert.equal((await state()).analysisStatus.phase, "unavailable");
      await page.evaluate(() => window.__releaseCompare());
      await page.waitForTimeout(70);
      assert.equal((await state()).analysisStatus.phase, "unavailable");
      await fixture("delayed");
      await page.waitForFunction(() => !!window.__releaseCompare);
      await page.locator("#swap-real-pair").click();
      await page.evaluate(() => {
        window.__releaseCompare();
        window.__releaseCompare = null;
      });
      await page.waitForFunction(() => !!window.__releaseCompare);
      await page.evaluate(() => window.__releaseCompare());
      await analysisSettled();
      assert.equal((await state()).analysisStatus.pair.a, "2");
      await fixture("delayed");
      await page.waitForFunction(() => !!window.__releaseCompare);
      await page.evaluate(
        () => (window.__oldRelease = window.__releaseCompare),
      );
      await fixture();
      await page.evaluate(() => window.__oldRelease());
      await page.waitForTimeout(70);
      assert.equal((await state()).analysisStatus.pair.a, "1");
    },
  );
  if (process.env.APEX_REAL_BROWSER === "1") {
    const { runPrivateAcceptance } =
      await import("./analysis-private-acceptance.mjs");
    await runPrivateAcceptance({
      page,
      state,
      check,
      analysisSettled,
      mode,
      responsive,
      assertCursor,
      seekDistance,
      report,
    });
  }
  await check(
    "DEMO return and teardown preserve isolation and empty private storage",
    async () => {
      await page.evaluate(() => (location.hash = "sessions"));
      await page.locator("main [data-action=use-demo]").click();
      assert.equal((await state()).source.mode, "demo");
      await mode("map");
      assert.equal(await page.locator("#track-workspace").count(), 1);
      assert.equal(
        await page.evaluate(
          () => window.__workers.filter((w) => w.active).length,
        ),
        0,
      );
      await page.evaluate(() =>
        dispatchEvent(new PageTransitionEvent("pagehide")),
      );
      const storage = await page.evaluate(async () => ({
        caches: await caches.keys(),
        db:
          typeof indexedDB.databases === "function"
            ? (await indexedDB.databases()).length
            : 0,
        sw: (await navigator.serviceWorker.getRegistrations()).length,
      }));
      assert.deepEqual(storage, { caches: [], db: 0, sw: 0 });
    },
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.prohibitedRequests, []);
} catch (error) {
  report.failure = error.stack;
  await shot("failure").catch(() => {});
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await fs.writeFile(
    path.join(out, "analysis-acceptance.json"),
    JSON.stringify(report, null, 2),
  );
  await context.close();
  await new Promise((r) => server.close(r));
  await fs.rm(profile, { recursive: true, force: true });
}
