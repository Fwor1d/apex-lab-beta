import test from "node:test";
import assert from "node:assert/strict";
import { trajectoryFixture, duckFile } from "../fixtures/trajectory-source.mjs";
import { createAppStore } from "../../app/core/app-state.js";
import { DemoSource } from "../../app/data/demo-source.js";
import { fitNativeBounds, cameraFrame } from "../../app/native-camera.js";
import { prepareNativeSpatial } from "../../app/data/native-spatial.js";
async function fixture(options = {}) {
  const f = trajectoryFixture(options);
  await f.source.open(duckFile());
  await f.source.comparePair("1", "2");
  return f;
}
async function storeFixture(options = {}) {
  const f = trajectoryFixture(options),
    store = createAppStore(f.source);
  store.setImportStatus({ phase: "validating" });
  store.setImportStatus({ phase: "importing" });
  await f.source.open(duckFile());
  store.commitImportedSource();
  await new Promise((r) => setImmediate(r));
  assert.ok(store.source.analysis);
  return { ...f, store };
}
const tick = () => new Promise((r) => setImmediate(r));
test("native adapter preserves authoritative arrays, relative frame and unclosed geometry", async () => {
  const f = await fixture();
  const s = await f.source.requestTrajectory(),
    t = f.source.trajectory;
  assert.equal(s.phase, "ready");
  assert.equal(s.pairAvailable, true);
  assert.equal(s.geographic, false);
  assert.equal(s.yaw, false);
  assert.equal(s.events, false);
  assert.equal(s.unit, "candidate-metre");
  assert.equal(t.paths.a.samples, f.raw.a.samples);
  assert.equal(t.paths.b.samples, f.raw.b.samples);
  assert.equal(t.paths.b.samples[0].y - t.paths.a.samples[0].y, 2);
  const before = JSON.stringify(f.raw);
  for (let d = 0; d <= 2000; d += 0.7) {
    f.source.positionAt("1", d);
    f.source.positionAt("2", d);
  }
  assert.equal(JSON.stringify(f.raw), before);
  assert.doesNotMatch(t.pathData("a"), /Z|NaN|Infinity/);
  assert.equal((t.pathData("a").match(/ M/g) || []).length, 1);
  assert.equal(f.source.positionAt("1", -1), null);
  assert.equal(f.source.positionAt("2", 2001), null);
  f.source.dispose();
});
test("canonical B-time maps both markers to original bounded samples, without coordinate interpolation", async () => {
  const { store } = await storeFixture();
  await store.loadTrajectory();
  assert.equal(store.seekTime(10.517), true);
  const d = store.state.cursorM;
  for (const id of ["1", "2"]) {
    const p = store.source.positionAt(id, d);
    assert.ok(p);
    const path = store.source.trajectory.paths[id === "1" ? "a" : "b"];
    const raw = path.samples.find((v) => v.timeS === p.timeS);
    assert.ok(raw);
    assert.deepEqual(p, {
      ...raw,
      kind: "synthetic",
      unit: "candidate-metre",
      frame: path.frame,
    });
    assert.ok(Math.abs(p.timeS - store.source.timeAt(id, d)) <= 0.051);
  }
  assert.equal(store.state.playback.cursor.basis, "time");
  assert.equal(store.state.playback.cursor.value, 10.517);
  store.source.dispose();
});
test("native gaps break paths and hide markers throughout unavailable links", async () => {
  const f = await fixture({ variant: "gap" });
  const s = await f.source.requestTrajectory();
  assert.equal(s.phase, "partial");
  assert.ok(s.brokenLinks >= 4);
  assert.equal(f.source.positionAt("1", 400), null);
  assert.equal(f.source.positionAt("1", 395), null);
  assert.equal(f.source.positionAt("1", 405), null);
  assert.ok(f.source.positionAt("1", 410));
  assert.equal(
    (f.source.trajectory.pathData("a").match(/ M/g) || []).length,
    2,
  );
  assert.equal(
    (f.source.trajectory.pathData("a", [380, 420]).match(/ M/g) || []).length,
    2,
  );
  f.source.dispose();
});
for (const [variant, phase, a, b] of [
  ["missing", "unavailable", false, false],
  ["jump", "unavailable", false, false],
  ["missing-a", "partial", false, true],
  ["missing-b", "partial", true, false],
  ["incompatible", "partial", true, false],
])
  test(`spatial ${variant} does not invalidate telemetry`, async () => {
    const f = await fixture({ variant });
    const analysis = f.source.analysis;
    const s = await f.source.requestTrajectory();
    assert.equal(s.phase, phase);
    assert.deepEqual(s.available, { a, b });
    assert.equal(f.source.analysis, analysis);
    assert.ok(f.source.valueAt("2", 100).speedMps);
    assert.equal(f.source.descriptor.capabilities.positions, a || b);
    f.source.dispose();
  });
test("malformed frames, units, links, provenance and limits fail closed", async () => {
  const f = await fixture();
  await f.source.requestTrajectory();
  const mutations = [
    (r) => (r.a.frame = "other"),
    (r) => (r.a.coordinateUnit = "metres"),
    (r) => (r.a.kind = "telemetry-derived"),
    (r) => (r.a.origin = [NaN, 0]),
    (r) => (r.a.geographicMapping = true),
    (r) => (r.a.yawVerified = true),
    (r) => (r.a.links[0] = true),
    (r) => r.a.links.pop(),
    (r) => (r.a.samples[1].timeS = 0),
    (r) => (r.a.samples[1].x = Infinity),
    (r) => (r.a.samples = Array(50001).fill(r.a.samples[0])),
  ];
  for (const mutate of mutations) {
    const raw = structuredClone(f.raw);
    mutate(raw);
    assert.throws(
      () => prepareNativeSpatial(f.source.descriptor, f.source.analysis, raw),
      /NATIVE_CONTRACT/,
    );
  }
  f.source.dispose();
});
test("one cached active-pair request; repeated view and cursor changes do not query Worker", async () => {
  const f = await fixture();
  await Promise.all([
    f.source.requestTrajectory(),
    f.source.requestTrajectory(),
    f.source.requestTrajectory(),
  ]);
  const a = f.source.trajectory;
  await f.source.requestTrajectory();
  assert.equal(f.source.trajectory, a);
  assert.equal(
    f.client.calls.filter((c) => c.action === "native-trajectory").length,
    1,
  );
  for (let i = 0; i < 30; i++) f.source.positionAt("2", i * 50);
  assert.equal(f.client.calls.filter((c) => c.action === "open").length, 1);
  await f.source.comparePair("2", "1");
  assert.equal(f.source.trajectory, null);
  await f.source.requestTrajectory();
  assert.deepEqual(f.source.trajectory.summary.pair, {
    sessionId: "fixture-session",
    a: "2",
    b: "1",
  });
  f.source.dispose();
});
test("late pair result is invalidated and replacement retains only active arrays", async () => {
  let release;
  const f = await fixture({
    beforeCall: async (action) => {
      if (action === "native-trajectory")
        await new Promise((r) => (release = r));
    },
  });
  const old = f.source.requestTrajectory();
  await tick();
  await f.source.comparePair("2", "3");
  assert.equal(f.source.trajectory, null);
  release();
  assert.equal(await old, null);
  assert.equal(f.source.trajectory, null);
  const next = f.source.requestTrajectory();
  await tick();
  release();
  await next;
  assert.equal(f.source.trajectory.summary.pair.b, "3");
  f.source.dispose();
  assert.equal(f.source.trajectory, null);
});
test("cancel native preparation preserves comparison; late response cannot restore map, retry works", async () => {
  let release;
  const { store, client } = await storeFixture({
    beforeCall: async (action) => {
      if (action === "native-trajectory")
        await new Promise((r) => (release = r));
    },
  });
  const analysis = store.source.analysis,
    p = store.loadTrajectory();
  await tick();
  store.cancelTrajectory();
  release();
  assert.equal(await p, false);
  assert.equal(store.source.trajectory, null);
  assert.equal(store.source.analysis, analysis);
  assert.equal(store.state.spatialStatus.phase, "cancelled");
  const retry = store.loadTrajectory(true);
  await tick();
  release();
  assert.equal(await retry, true);
  assert.equal(
    client.calls.filter((c) => c.action === "native-trajectory").length,
    2,
  );
  store.source.dispose();
});
test("source switch and DEMO dispose pending spatial owner; callback cannot publish or retain paths", async () => {
  let release;
  const { store, source } = await storeFixture({
    beforeCall: async (action) => {
      if (action === "native-trajectory")
        await new Promise((r) => (release = r));
    },
  });
  const pending = store.loadTrajectory();
  await tick();
  store.setSource(new DemoSource());
  release();
  assert.equal(await pending, false);
  assert.equal(source.trajectory, null);
  assert.equal(source.analysis, null);
  assert.equal(store.state.source.mode, "demo");
  assert.equal(store.state.nativeCamera, null);
});
test("spatial request failure is bounded to map; no raw diagnostic leaks into AppState", async () => {
  const { store } = await storeFixture({
    beforeCall: async (action) => {
      if (action === "native-trajectory") throw Error("PRIVATE SENTINEL");
    },
  });
  const analysis = store.source.analysis;
  assert.equal(await store.loadTrajectory(), false);
  assert.equal(store.state.spatialStatus.phase, "failed");
  assert.equal(store.source.analysis, analysis);
  assert.doesNotMatch(
    JSON.stringify(store.snapshot()),
    /PRIVATE SENTINEL|"samples"|"links"/,
  );
  assert.throws(() => (store.state.spatialStatus = {}));
  store.source.dispose();
});
test("camera fits portrait/landscape and degenerate straight paths uniformly within padding", () => {
  for (const [w, h] of [
    [800, 400],
    [300, 450],
    [768, 1024],
  ])
    for (const bounds of [
      { minX: -400, minY: 0, maxX: 400, maxY: 800 },
      { minX: 0, minY: 0, maxX: 0, maxY: 800 },
    ]) {
      const f = fitNativeBounds(bounds, w, h);
      const scale = w / f.width;
      assert.ok(Math.abs(scale - h / f.height) < 1e-10);
      assert.ok((f.width - (bounds.maxX - bounds.minX)) * scale >= 55.99);
      assert.ok((f.height - (bounds.maxY - bounds.minY)) * scale >= 55.99);
      assert.equal(
        cameraFrame(f, { mode: "manual", cx: 123, cy: 456, zoom: 100 }).zoom,
        24,
      );
      assert.equal(
        cameraFrame(f, { mode: "fit", cx: 123, cy: 456, zoom: 1 }).cx,
        f.cx,
      );
    }
  assert.equal(fitNativeBounds(null, 300, 500), null);
  assert.equal(
    fitNativeBounds({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, 300, 500),
    null,
  );
});

test("profile gaps and ambiguous distance reject spatial cursor even with valid coordinate samples", async () => {
  for (const change of [
    (p) => (p.samples[1000].distanceM = null),
    (p) => (p.samples[1000].distanceM = p.samples[999].distanceM),
  ]) {
    const f = await fixture({ profileMutation: change });
    await f.source.requestTrajectory();
    assert.ok(f.source.trajectory.paths.a);
    assert.equal(f.source.positionAt("1", 1000), null);
    f.source.dispose();
  }
});
test("valid native geometry does not invent a marker beyond native sample coverage", async () => {
  const f = await fixture({
    transform: (r) => {
      for (const role of ["a", "b"]) {
        r[role].samples.pop();
        r[role].links.pop();
        r[role].samples.shift();
        r[role].links.shift();
        r[role].links[0] = false;
      }
      return r;
    },
  });
  await f.source.requestTrajectory();
  assert.equal(f.source.positionAt("1", 5), null);
  assert.equal(f.source.positionAt("2", 5), null);
  assert.equal(f.source.positionAt("1", 1999), null);
  assert.equal(f.source.positionAt("2", 1999), null);
  f.source.dispose();
});
test("degenerate coordinate bounds and nonfinite origin are rejected without alternate geometry", async () => {
  const f = await fixture();
  await f.source.requestTrajectory();
  const raw = structuredClone(f.raw);
  for (const p of raw.a.samples) {
    p.x = 10;
    p.y = 20;
  }
  assert.throws(
    () => prepareNativeSpatial(f.source.descriptor, f.source.analysis, raw),
    /NATIVE_CONTRACT/,
  );
  f.source.dispose();
});
test("rejection detail is fixed engine vocabulary; arbitrary diagnostic strings are excluded", async () => {
  const f = await fixture({
    variant: "jump",
    transform: (r) => {
      r.a.reasons.push("PRIVATE SENTINEL");
      return r;
    },
  });
  const s = await f.source.requestTrajectory();
  assert.match(s.message, /скачки/);
  assert.doesNotMatch(JSON.stringify(s), /PRIVATE SENTINEL/);
  f.source.dispose();
});
