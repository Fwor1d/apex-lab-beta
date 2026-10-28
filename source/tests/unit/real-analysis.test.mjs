import test from "node:test";
import assert from "node:assert/strict";
import {
  measuredMapping,
  prepareMeasuredAnalysis,
  displaySegments,
} from "../../app/data/measured-analysis.js";
import { recordingDescriptor } from "../../app/data/recording-source.js";
import { createAppStore } from "../../app/core/app-state.js";
import { compare } from "../../engine/apps/browser-telemetry/src/analysis.js";
import { analysisFixture, duckFile } from "../fixtures/analysis-source.mjs";
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-10, `${a} != ${b}`);
async function ready(options) {
  const fixture = analysisFixture(options);
  await fixture.source.open(duckFile());
  await fixture.source.comparePair("1", "2");
  return fixture;
}
function prepared(options) {
  const f = analysisFixture(options);
  const [a, b] = f.profiles;
  return prepareMeasuredAnalysis(
    recordingDescriptor(f.summary),
    "1",
    "2",
    a,
    b,
    { comparison: compare(a, b), pair: ["1", "2"] },
  );
}

test("REAL adapter preserves every engine grid/aligned/delta value and B-A sign without double conversion", async () => {
  const { source, profiles, client } = await ready();
  const c = compare(profiles[0], profiles[1]);
  assert.deepEqual(source.analysis.comparison, c);
  assert.equal(source.analysis.summary.recordedDifferenceS, 1);
  assert.equal(source.valueAt("1", 0).speedMps, 30);
  assert.equal(source.valueAt("2", 0).steeringNormalized, null);
  near(source.deltaAt(2000), 1);
  assert.equal(source.positionAt("1", 0), null);
  assert.equal(source.descriptor.capabilities.positions, false);
  assert.deepEqual(
    client.calls.map((c) => c.action),
    ["open", "profile", "profile", "compare"],
  );
  for (let i = 0; i < 100; i++) source.valueAt("1", i);
  assert.equal(client.calls.length, 4);
  await source.comparePair("2", "1");
  near(source.deltaAt(2000), -1);
  assert.equal(source.analysis.summary.recordedDifferenceS, -1);
});
test("measured nonlinear B mapping is exact at native samples, invertible, and never extrapolates", () => {
  const a = prepared();
  const m = a.mappings["2"];
  const p = a.profiles["2"].samples[123];
  assert.equal(m.timeAt(p.distanceM), p.timeS);
  assert.equal(m.distanceAt(p.timeS), p.distanceM);
  assert.notEqual(m.distanceAt(10.5), 1000);
  near(m.distanceAt(m.timeAt(123.456)), 123.456);
  assert.equal(m.timeAt(-1), null);
  assert.equal(m.timeAt(2001), null);
  assert.equal(m.distanceAt(22), null);
});
test("mapping rejects repeated distance/time, negative movement, gaps and ambiguous inverse", () => {
  const p = (d, t) => ({ distanceM: d, timeS: t });
  for (const samples of [
    [p(0, 0), p(1, 0.1), p(1, 0.2), p(2, 0.3)],
    [p(0, 0), p(1, 0.1), p(2, 0.1), p(3, 0.2)],
  ]) {
    const m = measuredMapping(samples);
    assert.equal(m.timeAt(1), null);
    assert.equal(m.distanceAt(0.1), null);
  }
  assert.equal(
    measuredMapping([p(0, 0), p(2, 0.1), p(1, 0.2)]).timeAt(0),
    null,
  );
  for (const samples of [
    [p(0, 0), p(30, 0.1)],
    [p(0, 0), p(2, 1)],
    [p(0, 0), p(null, 0.1), p(2, 0.2)],
  ]) {
    const m = measuredMapping(samples);
    assert.equal(m.distanceAt(0.05), null);
    assert.equal(m.timeAt(0.5), null);
  }
});
test("gaps remain absent, exact points survive, intervals cannot bridge missing data", () => {
  const a = prepared({
    mutation(p) {
      p.samples[100].speedMps = null;
      p.samples[200].distanceM = null;
    },
  });
  assert.equal(a.sample("1", "speedMps", 200), null);
  assert.equal(a.sample("1", "speedMps", 199), null);
  assert.equal(a.sample("1", "speedMps", 198), a.comparison.a.speedMps[99]);
  assert.equal(a.mappings["2"].timeAt(400), null);
  assert.equal(a.intervalDelta(380, 420), null);
  const segments = displaySegments(a.series("1", "speedMps"), 0, 2000, 10);
  assert.ok(segments.length >= 3);
  for (const run of segments)
    assert.ok(!run.some(([d]) => d < 200) || !run.some(([d]) => d > 200));
});
test("plateau disables engine delta, retains supported channels, never zero-fills", () => {
  const a = prepared({
    mutation(p) {
      p.samples[100].distanceM = p.samples[99].distanceM;
    },
  });
  assert.equal(a.summary.plateau, true);
  assert.equal(a.summary.coverage, 0);
  assert.equal(a.summary.commonEndDeltaS, null);
  assert.equal(a.sample("1", "deltaS", 1000), null);
  assert.ok(a.sample("1", "speedMps", 1000) > 0);
  assert.equal(a.mappings["2"].timeAt(198), null);
});
test("decimation preserves extrema, exact original points, chronology and breaks", () => {
  const values = Float64Array.from([0, 8, -9, 3, NaN, 2, 15, 1]),
    distances = Float64Array.from(values, (_, i) => i),
    connections = Uint8Array.from(values, (_, i) => (i > 0 ? 1 : 0));
  const segments = displaySegments({ values, distances, connections }, 0, 7, 1);
  assert.equal(segments.length, 2);
  assert.ok(segments.flat().some(([, v]) => v === -9));
  assert.ok(segments.flat().some(([, v]) => v === 15));
  for (const run of segments)
    for (let i = 0; i < run.length; i++) {
      assert.equal(run[i][1], values[run[i][0]]);
      if (i) assert.ok(run[i][0] > run[i - 1][0]);
    }
});
test("result identity, shapes and policy reject mismatched or untrusted publication", () => {
  const f = analysisFixture(),
    [a, b] = f.profiles,
    c = compare(a, b),
    d = recordingDescriptor(f.summary);
  assert.throws(() =>
    prepareMeasuredAnalysis(d, "1", "2", a, b, {
      comparison: c,
      pair: ["2", "1"],
    }),
  );
  assert.throws(() =>
    prepareMeasuredAnalysis(d, "1", "2", a, b, {
      comparison: { ...c, policy: { ...c.policy, grid_m: 4 } },
      pair: ["1", "2"],
    }),
  );
  assert.throws(() =>
    prepareMeasuredAnalysis(
      d,
      "1",
      "2",
      { ...a, provenance: { ...a.provenance, sessionId: "other" } },
      b,
      { comparison: c, pair: ["1", "2"] },
    ),
  );
});
test("store has one tagged cursor, exact seeks and bounded playback; snapshots do not contain profiles", async () => {
  const { source } = await ready();
  const store = createAppStore(source);
  store.state.loaded = true;
  await store.analyzePair();
  assert.ok(store.seekDistance(123.456));
  assert.equal(store.state.cursorM, 123.456);
  const t = store.state.playback.timeS;
  store.state.playing = true;
  store.advance(0.05);
  near(store.state.playback.timeS, t + 0.05);
  assert.equal(store.state.playback.cursor.basis, "time");
  assert.equal(store.snapshot().analysisStatus.phase, "partial");
  assert.equal(JSON.stringify(store.snapshot()).includes("samples"), false);
  assert.equal(store.seekDistance(-5), false);
  const end = source.duration(store.state.b);
  assert.ok(store.seekTime(end - 0.01));
  store.advance(0.1);
  assert.equal(store.state.playing, false);
  assert.equal(store.state.playback.timeS, end);
});
test("playback cannot step across a gap even when both endpoints would be valid", async () => {
  const { source } = await ready({
    mutation(p) {
      p.samples[100].distanceM = null;
    },
  });
  const store = createAppStore(source);
  store.state.loaded = true;
  await store.analyzePair();
  const end = source.analysis.mappings["2"].intervals[0].endS;
  store.seekTime(end - 0.005);
  store.state.playing = true;
  store.advance(0.1);
  assert.equal(store.state.playback.timeS, end);
  assert.equal(store.state.playing, false);
});
test("pair replacement during pending response publishes only newest selection; only active arrays retained", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  let first = true;
  const f = analysisFixture({
    beforeCall: async (action) => {
      if (action === "compare" && first) {
        first = false;
        await gate;
      }
    },
  });
  await f.source.open(duckFile());
  const firstRequest = f.source.comparePair("1", "2");
  while (first) await new Promise((r) => setImmediate(r));
  const second = f.source.comparePair("2", "1");
  assert.equal(f.source.analysis, null);
  release();
  assert.equal(await firstRequest, null);
  await second;
  assert.equal(f.source.analysis.summary.pair.a, "2");
  assert.equal(f.source.analysis.summary.recordedDifferenceS, -1);
  f.source.dispose();
  assert.equal(f.source.analysis, null);
  assert.equal(f.source.available("2"), false);
});
test("comparison failure does not invalidate imported session; cancel and retry are bounded", async () => {
  let fail = true;
  const f = analysisFixture({
    beforeCall: async (a) => {
      if (a === "compare" && fail) throw Error("private error never shown");
    },
  });
  await f.source.open(duckFile());
  const store = createAppStore(f.source);
  store.state.loaded = true;
  await store.analyzePair();
  assert.equal(store.state.analysisStatus.phase, "failed");
  assert.equal(store.state.loaded, true);
  assert.ok(!store.state.analysisStatus.message.includes("private"));
  store.cancelAnalysis();
  assert.equal(store.state.cursorM, null);
  fail = false;
  await store.analyzePair();
  assert.equal(store.state.analysisStatus.phase, "partial");
});

test("public context facade does not clamp unavailable REAL time to endpoints", async () => {
  const { appStore, distanceAtTime } =
    await import("../../app/core/context.js");
  const { source } = await ready();
  appStore.setSource(source);
  await appStore.analyzePair();
  assert.equal(distanceAtTime("2", 999), null);
  assert.equal(distanceAtTime("2", -1), null);
  appStore.source.dispose();
});

test("bounded samples preserve native units and missing masks without exposing the source arrays", async () => {
  const { source } = await ready({
    mutation(p) {
      p.samples[100].speedMps = null;
    },
  });
  const samples = source.samples("1", 198, 202);
  assert.deepEqual(
    samples.map((s) => s.distanceM),
    [198, 200, 202],
  );
  assert.equal(samples[1].speedMps, null);
  samples[0].speedMps = 999;
  assert.notEqual(source.valueAt("1", 198).speedMps, 999);
  assert.deepEqual(source.samples("missing", 0, 2000), []);
});
test("analysis summary is immutable and cannot be deleted through the state facade", async () => {
  const { source } = await ready(),
    store = createAppStore(source);
  await store.analyzePair();
  assert.throws(() => {
    delete store.state.analysisStatus;
  }, TypeError);
  assert.throws(() => {
    store.state.analysisStatus.mapping.startS = 99;
  }, TypeError);
});
