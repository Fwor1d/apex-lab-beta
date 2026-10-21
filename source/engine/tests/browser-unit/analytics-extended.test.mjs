import {pathToFileURL} from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  characterizeLap,
  buildExtended,
  recurringPatterns,
} from "../../apps/browser-telemetry/src/analytics-extended.js";
import { compare } from "../../apps/browser-telemetry/src/analysis.js";
function lap(id = "A") {
  const keys = [
    "timeS",
    "distanceM",
    "speedMps",
    "brake",
    "throttle",
    "steeringNormalized",
  ];
  return {
    profile: {
      kind: "synthetic",
      context: { carId: "unknown", circuitId: "unknown", layoutId: "other" },
      provenance: { sessionId: "synthetic", lapId: id, distanceBasis: "test" },
      channels: Object.fromEntries(
        keys.map((k) => [
          k,
          {
            status: "synthetic",
            sampling: { nativeFrequencyHz: 10, timeUncertaintyS: 0.1 },
          },
        ]),
      ),
      samples: Array.from({ length: 301 }, (_, i) => ({
        timeS: i * 0.1,
        distanceM: i * 2,
        speedMps: 20,
        brake: i >= 30 && i <= 49 ? 0.6 - (i - 30) * 0.02 : 0,
        throttle: i > 70 ? 0.8 : 0,
        steeringNormalized: 0.2 + i * 0.002,
      })),
    },
    validation: { eligible: true, pit: false, recordedTimeS: 30 },
  };
}
test("new measured metrics do not change original profiles or comparison", () => {
  const a = lap(),
    b = lap("B"),
    c = compare(a, b),
    before = JSON.stringify({ a, b, c });
  const r = buildExtended(a, b, c, { laps: [a, b] });
  assert(r.a[0].brakeIntegralRatioS > 0);
  assert(r.a[0].releaseCoordinationS > 0);
  assert.equal(r.a[0].timeImpactS, null);
  assert.equal(r.a[0].pressureMeasured, false);
  assert.equal(JSON.stringify({ a, b, c }), before);
  assert.equal(r.recurring.status, "insufficient-data");
});
test("missing steering does not become zero coordination", () => {
  const a = lap();
  a.profile.channels.steeringNormalized.status = "missing";
  assert.equal(characterizeLap(a)[0].releaseCoordinationS, null);
});
test("gaps, plateau and reversal interrupt episode instead of filling it", () => {
  for (const k of ["distanceM", "timeS", "brake"]) {
    const a = lap();
    a.profile.samples[40][k] = null;
    assert.equal(characterizeLap(a).length, 0);
  }
  const a = lap();
  a.profile.samples[40].distanceM = a.profile.samples[39].distanceM;
  assert.equal(characterizeLap(a).length, 0);
});
test("at least 3 distinct compatible clean laps for descriptive input variation", () => {
  const a = lap(),
    b = lap("B"),
    c = lap("C");
  assert.equal(recurringPatterns(a, [a, b, b]).status, "insufficient-data");
  const r = recurringPatterns(a, [a, b, c]);
  assert.equal(r.status, "descriptive");
  assert.equal(r.patterns[0].matchedLapCount, 3);
  assert.equal(r.patterns[0].metrics.startM.range, 0);
  c.profile.context.layoutId = "different";
  assert.equal(recurringPatterns(a, [a, b, c]).status, "insufficient-data");
});
test("unknown pit state and unrelated cars cannot make a recurring pattern", () => {
  const a = lap(),
    b = lap("B"),
    c = lap("C");
  c.validation.pit = null;
  assert.equal(recurringPatterns(a, [a, b, c]).eligibleLapCount, 2);
  c.validation.pit = false;
  c.profile.context.carId = "other";
  assert.equal(recurringPatterns(a, [a, b, c]).eligibleLapCount, 2);
});
test("50m windows are an alternative partition; no duplicate ownership or extrapolation", () => {
  const a = lap(),
    b = lap("B");
  b.profile.samples.forEach((s) => (s.timeS *= 1.1));
  const c = compare(a, b),
    r = buildExtended(a, b, c);
  const sorted = r.microSegments.toSorted((a, b) => a.startM - b.startM);
  for (let i = 1; i < sorted.length; i++)
    assert(sorted[i].startM >= sorted[i - 1].endM);
  assert(
    Math.abs(sorted.reduce((n, v) => n + v.changeS, 0) - c.deltaS.at(-1)) <
      1e-10,
  );
  assert(r.microSegments.every((v) => v.ownership.includes("do not add")));
});
test("bounded grid and input workload rejects corrupt requests", () => {
  const a = lap(),
    b = lap("B"),
    c = compare(a, b);
  c.distanceM[5] = 0;
  assert.throws(() => buildExtended(a, b, c));
  const d = lap();
  d.profile.samples = Array(250001).fill(d.profile.samples[0]);
  assert.throws(() => characterizeLap(d));
});
test(
  "private oracle assertions: analytics-extended (local opt-in)",
  { skip: !(process.env.APEX_BROWSER_ORACLE && process.env.APEX_PRIVATE_TESTS) },
  async () => {
    const {default: run} = await import(pathToFileURL(`${process.env.APEX_PRIVATE_TESTS}/analytics-extended.mjs`).href);
    await run({assert, readFileSync, compare, buildExtended});
  },
);