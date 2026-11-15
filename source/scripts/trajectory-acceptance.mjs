import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "./serve.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  engine = process.env.APEX_BROWSER === "webkit" ? "webkit" : "chromium",
  out = path.join(root, "evidence/phase4", engine);
await fs.mkdir(out, { recursive: true });
await fs.mkdir(path.join(root, "tmp"), { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, ".cache/playwright");
const playwright = await import("playwright"),
  server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`,
  base = "/apex-lab/";
const context = await playwright[engine].launchPersistentContext(
  path.join(root, "tmp", "phase4-browser-" + engine),
  {
    headless: true,
    viewport: { width: 1440, height: 900 },
    hasTouch: true,
    reducedMotion: "reduce",
    acceptDownloads: false,
    env: { ...process.env, TMPDIR: path.join(root, "tmp") },
  },
);
const report = {
  engine,
  platform: process.platform,
  node: process.version,
  checks: [],
  errors: [],
  prohibitedRequests: [],
  screenshots: [],
  performance: [],
  authenticAcceptance: "pending: synthetic transport only",
  touch:
    engine === "chromium"
      ? "pending"
      : "WebKit tap only; physical pinch not verified",
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
for (const name of [
  "trajectory-source.mjs",
  "analysis-source.mjs",
  "session-summary.mjs",
]) {
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
});
const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultTimeout(20000);
page.on("pageerror", (e) =>
  report.errors.push({ message: e.message, check: report.runningCheck }),
);
const state = () =>
  page.evaluate(async () =>
    (await import("./core/context.js")).appStore.snapshot(),
  );
const command = (action, values = []) =>
  page.evaluate(
    async ({ action, values }) => {
      const store = (await import("./core/context.js")).appStore;
      return store[action](...values);
    },
    { action, values },
  );
const check = async (name, fn) => {
  report.runningCheck = name;
  await fn();
  report.checks.push(name);
  console.log("PASS " + name);
};
const mode = async (value) => {
  await page.locator(`[data-mode=${value}]`).first().click();
};
const settled = () =>
  page.waitForFunction(async () => {
    const s = (await import("./core/context.js")).appStore.state;
    return (
      ["ready", "partial", "failed", "unavailable", "cancelled"].includes(
        s.spatialStatus.phase,
      ) && s.analysisStatus.phase !== "pending"
    );
  });
async function fixture(variant = "normal", nativePoints = 201) {
  await page.evaluate(
    async ({ variant, nativePoints }) => {
      const { appStore } = await import("./core/context.js"),
        { trajectoryFixture, duckFile } =
          await import("./__test/trajectory-source.mjs");
      window.__releaseNative = null;
      const f = trajectoryFixture({
        variant,
        nativePoints,
        beforeCall: async (action) => {
          if (action === "native-trajectory" && variant === "failed")
            throw Error("PRIVATE SENTINEL");
          if (action === "native-trajectory" && variant === "delayed")
            await new Promise((r) => (window.__releaseNative = r));
        },
      });
      appStore.setSource(f.source);
      appStore.setImportStatus({ phase: "validating" });
      appStore.setImportStatus({ phase: "importing" });
      await f.source.open(duckFile());
      appStore.commitImportedSource();
      appStore.setImportStatus({
        phase: "ready",
        message: "TEST · synthetic native fixture",
      });
      window.__fixture = f;
      location.hash = "telemetry";
      appStore.state.mode = "map";
    },
    { variant, nativePoints },
  );
  await page.waitForSelector("#native-map-host");
  if (variant === "delayed")
    await page.waitForFunction(() => !!window.__releaseNative);
  else await settled();
}
async function shot(name) {
  await page.screenshot({
    path: path.join(out, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(name + ".png");
}
async function assertCursor() {
  const result = await page.evaluate(async () => {
    const { appStore } = await import("./core/context.js"),
      s = appStore.state;
    return {
      d: s.cursorM,
      time: s.playback.timeS,
      mapped: appStore.source.timeAt(s.b, s.cursorM),
      markers: ["a", "b"].map((r) => {
        const p = appStore.source.positionAt(s[r], s.cursorM),
          el = document.querySelector(`[data-native-marker=${r}]`);
        return {
          p,
          hidden: !el || getComputedStyle(el).display === "none",
          transform: el?.getAttribute("transform"),
          time: el?.dataset.time,
        };
      }),
      hud: document.querySelector("#hud-speed")?.textContent,
      speed: appStore.source.valueAt(s.b, s.cursorM)?.speedMps,
      curves: [...document.querySelectorAll(".real-plot [data-cursor]")].map(
        (e) => Number(e.dataset.distance),
      ),
    };
  });
  assert.ok(Math.abs(result.time - result.mapped) < 1e-9);
  assert.equal(result.curves.length, 5);
  if (Number.isFinite(result.speed))
    assert.ok(
      result.hud.includes(
        (result.speed * 3.6).toLocaleString("ru-RU", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      ),
    );
  assert.ok(result.curves.every((d) => d === result.d));
  for (const { p, hidden, transform, time } of result.markers) {
    assert.equal(hidden, !p);
    if (p) {
      assert.equal(transform, `translate(${p.x},${-p.y})`);
      assert.equal(Number(time), p.timeS);
    }
  }
}
try {
  await page.goto(origin + base + "#telemetry");
  await check(
    "Native engine synthetic A/B paths, common raw frame, labels and disabled events",
    async () => {
      await fixture();
      assert.equal((await state()).spatialStatus.phase, "ready");
      assert.equal(await page.locator("[data-native-path]").count(), 2);
      assert.equal(
        await page.locator("#map,#track-workspace,[data-map-event]").count(),
        0,
      );
      assert.match(await page.locator("#native-map-host").innerText(), /TEST/);
      assert.equal((await state()).source.kind, "synthetic");
      await command("seekDistance", [1000]);
      await assertCursor();
    },
  );
  await check(
    "Five viewports: uniform fit containment, no overflow, readable labels, native 44px controls",
    async () => {
      for (const [width, height] of [
        [1440, 900],
        [1280, 720],
        [768, 1024],
        [390, 844],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        await page.locator("#native-fit").click();
        await page.waitForTimeout(60);
        const metrics = await page.evaluate(() => {
          const svg = document.querySelector("#native-scene"),
            v = svg.viewBox.baseVal,
            r = svg.getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            small: [
              ...document.querySelectorAll(
                "#native-map-host p,#native-map-host button,#native-map-host select,#native-map-host span",
              ),
            ]
              .filter(
                (e) =>
                  e.getClientRects().length &&
                  parseFloat(getComputedStyle(e).fontSize) < 11,
              )
              .map((e) => e.tagName),
            short: [
              ...document.querySelectorAll(
                ".native-toolbar button,.native-toolbar select",
              ),
            ]
              .filter((e) => e.getBoundingClientRect().height < 44)
              .map((e) => e.id),
            ratio: Math.abs(v.width / v.height - r.width / r.height),
            paths: [...document.querySelectorAll("[data-native-path]")].map(
              (p) => {
                const b = p.getBBox();
                return {
                  x: b.x - v.x,
                  y: b.y - v.y,
                  right: v.x + v.width - b.x - b.width,
                  bottom: v.y + v.height - b.y - b.height,
                };
              },
            ),
          };
        });
        assert.ok(metrics.overflow <= 0, JSON.stringify(metrics));
        assert.deepEqual(metrics.small, []);
        assert.deepEqual(metrics.short, []);
        assert.ok(metrics.ratio < 0.0001);
        assert.ok(
          metrics.paths.every((p) => Object.values(p).every((v) => v > 0)),
        );
        await page.evaluate(() => scrollTo(0, 0));
        await shot("native-" + width);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    },
  );
  await check(
    "B-time seek, graph keyboard, range highlights and playback share one cursor",
    async () => {
      await command("seekTime", [8.321]);
      await assertCursor();
      const old = (await state()).cursorM;
      await page.locator("#plot-speed").press("ArrowRight");
      assert.equal((await state()).cursorM, old + 10);
      await assertCursor();
      await command("setAnalysisRange", [300, 600]);
      await page.waitForTimeout(30);
      const range = await page
        .locator("[data-native-range=a]")
        .getAttribute("d");
      assert.ok(range.length > 0);
      assert.ok(
        range.length <
          (await page.locator("[data-native-path=a]").getAttribute("d")).length,
      );
      await page.locator("[data-real-range=full]").click();
      await page.locator("#rate").selectOption("2");
      await page.locator("#play").click();
      const start = (await state()).playback.timeS;
      await page.waitForTimeout(230);
      await page.locator("#play").click();
      assert.ok((await state()).playback.timeS > start);
      await assertCursor();
    },
  );
  await check(
    "Follow A/B, mouse pan, wheel and keyboard change camera without cursor/range changes",
    async () => {
      const before = await state();
      await page.locator("#native-follow").selectOption("a");
      await page.waitForTimeout(30);
      assert.equal((await state()).nativeCamera.mode, "follow");
      const follow = await page.evaluate(async () => {
        const { appStore } = await import("./core/context.js");
        return {
          camera: appStore.snapshot().nativeCamera,
          point: appStore.source.positionAt(
            appStore.state.a,
            appStore.state.cursorM,
          ),
        };
      });
      assert.equal(follow.camera.cx, follow.point.x);
      assert.equal(follow.camera.cy, -follow.point.y);
      await page.locator("#native-follow").selectOption("b");
      await shot("native-follow");
      await page.locator("#native-scene").scrollIntoViewIfNeeded();
      const b = await page.locator("#native-scene").boundingBox();
      await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.6, {
        steps: 5,
      });
      await page.mouse.up();
      assert.equal((await state()).nativeCamera.mode, "manual");
      await page.mouse.wheel(0, -100);
      await page.locator("#native-scene").press("ArrowLeft");
      await page.locator("#native-scene").press("+");
      await shot("native-manual-zoom");
      const after = await state();
      assert.equal(after.cursorM, before.cursorM);
      assert.deepEqual(after.range, before.range);
      assert.ok(after.nativeCamera.zoom > 1);
      await page.locator("#native-scene").press("Home");
      assert.equal((await state()).nativeCamera.mode, "fit");
    },
  );
  await check(
    "Mini-map shares raw geometry and camera viewport; navigation does not seek",
    async () => {
      for (const r of ["a", "b"])
        assert.equal(
          await page.locator(`[data-mini-path=${r}]`).getAttribute("d"),
          await page.locator(`[data-native-path=${r}]`).getAttribute("d"),
        );
      const before = await state();
      await page.locator("#native-mini").click({ position: { x: 50, y: 40 } });
      assert.equal((await state()).nativeCamera.mode, "manual");
      assert.equal((await state()).cursorM, before.cursorM);
      assert.deepEqual((await state()).range, before.range);
      await page.locator("#native-mini").press("Home");
    },
  );
  await check(
    "Visible series refit, hidden marker and geometry; repeated views use cached pair",
    async () => {
      const requests = await page.evaluate(
        () =>
          window.__fixture.client.calls.filter(
            (c) => c.action === "native-trajectory",
          ).length,
      );
      await page.locator("#real-series-b").uncheck();
      assert.equal(
        await page.locator("[data-native-marker=b]").isVisible(),
        false,
      );
      await page.locator("#real-series-a").uncheck();
      assert.equal(await page.locator("#native-scene").isVisible(), false);
      await page.locator("#real-series-b").check();
      await page.locator("#real-series-a").check();
      await page.locator("#native-follow").selectOption("b");
      const camera = (await state()).nativeCamera;
      await page.locator("#real-channel").selectOption("brake");
      assert.deepEqual((await state()).nativeCamera, camera);
      await mode("pitwall");
      await mode("map");
      assert.deepEqual((await state()).nativeCamera, camera);
      await settled();
      assert.equal(
        await page.evaluate(
          () =>
            window.__fixture.client.calls.filter(
              (c) => c.action === "native-trajectory",
            ).length,
        ),
        requests,
      );
      await assertCursor();
    },
  );
  await check(
    "Touch controls; Chromium native two-finger pinch and pan preserve analysis",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("#native-scene").scrollIntoViewIfNeeded();
      const before = await state();
      await page.locator("#native-plus").tap();
      if (engine === "chromium") {
        await page.locator("#native-scene").scrollIntoViewIfNeeded();
        const r = await page.locator("#native-scene").boundingBox(),
          x = r.x + r.width / 2,
          y = r.y + r.height / 2,
          cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { x: x - 25, y, id: 1 },
            { x: x + 25, y, id: 2 },
          ],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: x - 50, y: y + 10, id: 1 },
            { x: x + 50, y: y + 10, id: 2 },
          ],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await cdp.detach();
        assert.ok((await state()).nativeCamera.zoom > 1.25);
        report.touch =
          "Chromium CDP two-finger pinch + translation and tap passed";
      }
      assert.equal((await state()).cursorM, before.cursorM);
      assert.deepEqual((await state()).range, before.range);
      await page.setViewportSize({ width: 1440, height: 900 });
    },
  );
  await check(
    "Swap updates identities and releases old geometry without resetting valid mathematical contracts",
    async () => {
      await page.locator("#play").click();
      assert.equal((await state()).playback.playing, true);
      await page.locator("#swap-real-pair").click();
      await settled();
      const s = await state();
      assert.equal(s.a, "2");
      assert.equal(s.b, "1");
      assert.deepEqual(s.spatialStatus.pair, {
        sessionId: s.source.id,
        a: "2",
        b: "1",
      });

      assert.equal(s.playback.playing, false);
      await command("seekDistance", [1000]);
      await assertCursor();
    },
  );
  await check(
    "Missing samples hide markers, split paths, freeze Follow; graph failure remains independent",
    async () => {
      await fixture("gap");
      assert.equal((await state()).spatialStatus.phase, "partial");
      await command("seekDistance", [390]);
      await page.locator("#native-follow").selectOption("a");
      await page.waitForTimeout(25);
      const previous = (await state()).nativeCamera;
      await command("seekDistance", [400]);
      await page.waitForTimeout(25);
      assert.equal(
        await page.locator("[data-native-marker=a]").isVisible(),
        false,
      );
      assert.equal((await state()).nativeCamera.cx, previous.cx);
      assert.equal((await state()).nativeCamera.cy, previous.cy);
      assert.match(
        await page.locator("#native-follow-status").innerText(),
        /приостановлено/,
      );
      assert.equal(
        (await page.locator("[data-native-path=a]").getAttribute("d")).split(
          " M",
        ).length - 1,
        2,
      );
      await shot("native-gap");
    },
  );
  await check(
    "Unavailable, single-path and incompatible-pair cases preserve graphs without DEMO substitution",
    async () => {
      for (const [variant, phase, paths] of [
        ["missing", "unavailable", 0],
        ["jump", "unavailable", 0],
        ["missing-a", "partial", 1],
        ["incompatible", "partial", 1],
      ]) {
        await fixture(variant);
        assert.equal((await state()).spatialStatus.phase, phase);
        assert.equal(await page.locator("[data-native-path]").count(), paths);
        assert.equal(await page.locator(".real-plot").count(), 5);
        assert.equal(await page.locator("#track-workspace,#map").count(), 0);
        await command("seekDistance", [1000]);
        if (variant === "jump") await shot("native-invalid");
        if (variant === "incompatible") {
          await page.locator("#real-series-a").uncheck();
          assert.match(
            await page.locator("#native-position-status").innerText(),
            /доступны: A/,
          );
          assert.equal(await page.locator("#real-series-b").isChecked(), true);
          assert.equal(
            await page.locator("#plot-speed [data-lap=b]").count(),
            1,
          );
          await page.locator("#real-series-a").check();
        }
      }
      await shot("native-partial");
    },
  );
  await check(
    "Pending/cancel/retry/failure; stale pair and source completions cannot publish",
    async () => {
      await fixture("delayed");
      await page.locator("#native-cancel").click();
      await page.evaluate(() => window.__releaseNative());
      await settled();
      assert.equal((await state()).spatialStatus.phase, "cancelled");
      assert.equal(await page.locator("[data-native-path]").count(), 0);
      await page.locator("#native-retry").click();
      await page.waitForTimeout(30);
      await page.evaluate(() => window.__releaseNative());
      await settled();
      assert.equal((await state()).spatialStatus.phase, "ready");
      await fixture("delayed");
      await page.locator("#swap-real-pair").click();
      await page.evaluate(() => {
        window.__releaseNative();
        window.__releaseNative = null;
      });
      await page.waitForFunction(() => !!window.__releaseNative);
      await page.evaluate(() => window.__releaseNative());
      await settled();
      assert.equal((await state()).spatialStatus.pair.a, "2");
      await fixture("delayed");
      await page.evaluate(
        () => (window.__staleNative = window.__releaseNative),
      );
      await fixture("normal");
      await page.evaluate(() => window.__staleNative());
      await settled();
      assert.equal((await state()).spatialStatus.pair.a, "1");
      await fixture("failed");
      assert.equal((await state()).spatialStatus.phase, "failed");
      assert.doesNotMatch(
        await page.locator("main").innerText(),
        /PRIVATE SENTINEL/,
      );
      assert.equal(await page.locator(".real-plot").count(), 5);
    },
  );
  await check(
    "Representative long synthetic workload: one preparation, bounded lookup, stable geometry during playback",
    async () => {
      const start = performance.now();
      await fixture("normal", 5001);
      const loadMs = performance.now() - start;
      assert.equal((await state()).spatialStatus.phase, "ready");
      assert.equal((await state()).spatialStatus.pairAvailable, true);
      const metrics = await page.evaluate(async () => {
        const { appStore } = await import("./core/context.js"),
          t = appStore.source.trajectory;
        window.__nativeRenderCounts = { serializationCalls: 0 };
        const original = t.pathData;
        t.pathData = (...args) => {
          window.__nativeRenderCounts.serializationCalls++;
          return original(...args);
        };
        const a = performance.now();
        for (let i = 0; i < 10000; i++) {
          appStore.source.positionAt("1", i % 2000);
          appStore.source.positionAt("2", i % 2000);
        }
        return {
          points: t.summary.points,
          aPoints: t.paths.a.samples.length,
          bPoints: t.paths.b.samples.length,
          profilePoints: appStore.source.analysis.profiles["1"].samples.length,
          requestMs: t.summary.metrics.requestMs,
          adaptationMs: t.summary.metrics.adaptationMs,
          engineMs: t.summary.metrics.preparationMs,
          lookup20000Ms: performance.now() - a,
        };
      });
      const d = await page.locator("[data-native-path=a]").getAttribute("d");
      await command("seekTime", [10]);
      await page.locator("#play").click();
      await page.waitForTimeout(250);
      await page.locator("#play").click();
      assert.equal(
        await page.locator("[data-native-path=a]").getAttribute("d"),
        d,
      );
      metrics.loadAndRenderMs = loadMs;
      metrics.requests = await page.evaluate(
        () =>
          window.__fixture.client.calls.filter(
            (c) => c.action === "native-trajectory",
          ).length,
      );
      assert.equal(metrics.requests, 1);
      assert.ok(metrics.aPoints >= 5001 && metrics.bPoints >= 5001);
      assert.equal(
        await page.evaluate(
          () => window.__nativeRenderCounts.serializationCalls,
        ),
        0,
      );
      report.performance.push(metrics);
      await assertCursor();
    },
  );
  await check(
    "Repeated replacement and DEMO restoration release spatial arrays and mounted resources",
    async () => {
      for (let i = 0; i < 3; i++) {
        await page.evaluate(
          () => (window.__oldSource = window.__fixture.source),
        );
        await fixture("normal");
        assert.equal(
          await page.evaluate(
            () =>
              window.__oldSource.trajectory === null &&
              window.__oldSource.analysis === null,
          ),
          true,
        );
      }
      await page.evaluate(() => (location.hash = "sessions"));
      await page.locator("main [data-action=use-demo]").click();
      await mode("map");
      assert.equal((await state()).source.mode, "demo");
      assert.equal(await page.locator("#track-workspace").count(), 1);
      assert.equal(await page.locator("#native-map-host").count(), 0);
      await fixture();
      assert.equal(await page.locator("#track-workspace").count(), 0);
      await page.evaluate(() =>
        dispatchEvent(new PageTransitionEvent("pagehide")),
      );
      assert.equal(
        await page.evaluate(() => window.__fixture.source.trajectory),
        null,
      );
    },
  );
  await check(
    "No page errors, external requests, personal persistence or service-worker cache",
    async () => {
      assert.deepEqual(report.errors, []);
      assert.deepEqual(report.prohibitedRequests, []);
      const storage = await page.evaluate(async () => ({
        caches: await caches.keys(),
        sw: (await navigator.serviceWorker.getRegistrations()).length,
        db:
          typeof indexedDB.databases === "function"
            ? (await indexedDB.databases()).length
            : 0,
      }));
      assert.deepEqual(storage, { caches: [], sw: 0, db: 0 });
    },
  );
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.failure = { message: e.message, stack: e.stack };
  await shot("failure").catch(() => {});
  process.exitCode = 1;
  console.error(e);
} finally {
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await context.close();
  await new Promise((r) => server.close(r));
}
