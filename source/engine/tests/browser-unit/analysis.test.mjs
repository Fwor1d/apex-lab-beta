import {pathToFileURL} from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  compare,
  interpolate,
  brakingZones,
  timeRegions,
  coach,
  toPortableNumbers,
} from "../../apps/browser-telemetry/src/analysis.js";
function fixture() {
  const keys = [
    "timeS",
    "distanceM",
    "speedMps",
    "brake",
    "throttle",
    "steeringNormalized",
  ];
  return {
    schemaVersion: "1.0.0",
    kind: "synthetic",
    context: {
      carId: "generic-car",
      circuitId: "generic-track",
      layoutId: "layout",
    },
    provenance: {
      sourceId: "test",
      sessionId: "same-session",
      lapId: "A",
      fixtureLabel: "СИНТЕТИЧЕСКИЙ ТЕСТ",
      distanceBasis: "recording-zero",
    },
    channels: Object.fromEntries(keys.map((k) => [k, { status: "synthetic" }])),
    samples: Array.from({ length: 101 }, (_, i) => ({
      timeS: i * 0.1,
      distanceM: i * 2,
      speedMps: 20,
      brake: 0,
      throttle: 1,
      steeringNormalized: 0,
    })),
  };
}
function pair() {
  const a = fixture(),
    b = structuredClone(a);
  b.provenance.lapId = "B";
  b.samples.forEach((s) => (s.timeS *= 1.1));
  return [a, b];
}
function near(a, b, tol = 1e-11) {
  assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}, Δ ${Math.abs(a - b)}`);
}
function numericParity(actual, expected, tolerance = 1e-10, label = "") {
  if (expected === null) {
    assert.ok(actual === null || Number.isNaN(actual), label);
    return;
  }
  if (typeof expected === "number") {
    near(actual, expected, tolerance);
    return;
  }
  if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, label);
    expected.forEach((v, i) =>
      numericParity(actual[i], v, tolerance, `${label}[${i}]`),
    );
    return;
  }
  if (expected && typeof expected === "object") {
    for (const [k, v] of Object.entries(expected))
      numericParity(actual[k], v, tolerance, `${label}.${k}`);
    return;
  }
  assert.equal(actual, expected, label);
}
test("different sample frequencies align by distance, not index", () => {
  const [a, b] = pair();
  b.samples = b.samples.filter((_, i) => i % 2 === 0);
  const c = compare(a, b);
  c.deltaS.forEach((v, i) => near(v, c.distanceM[i] * 0.005));
  near(c.deltaS.at(-1), 1);
});
test("delta zero is first shared reliable distance", () => {
  const [a, b] = pair();
  b.samples = b.samples.slice(10);
  b.samples.forEach((s) => (s.timeS += 1000));
  const c = compare(a, b);
  assert.equal(c.originM, 20);
  assert.equal(c.deltaS[0], 0);
  near(c.deltaS.at(-1), 0.9);
});
test("null signal, null distance and gaps are never bridged", () => {
  const a = fixture();
  a.samples[1].brake = null;
  const v = interpolate(a, "brake", [-1, 0, 1, 2, 3, 4, 201]);
  assert.deepEqual(toPortableNumbers(v), [null, 0, null, null, null, 0, null]);
  a.samples[1].distanceM = null;
  assert.ok(Number.isNaN(interpolate(a, "speedMps", [2])[0]));
  a.samples = [a.samples[0], a.samples.at(-1)];
  assert.ok(Number.isNaN(interpolate(a, "speedMps", [100])[0]));
});
test("missing observations stay missing but do not invalidate another signal", () => {
  const [a, b] = pair();
  for (const p of [a, b]) {
    p.channels.steeringNormalized.status = "missing";
    p.samples.forEach((s) => (s.steeringNormalized = null));
  }
  const c = compare(a, b);
  assert.ok(c.a.steeringNormalized.every(Number.isNaN));
  assert.equal(c.coverage, 1);
});
test("distance plateau disables ambiguous delta", () => {
  const [a, b] = pair();
  b.samples[1].distanceM = 0;
  const c = compare(a, b);
  assert.equal(c.plateau, true);
  assert.ok(c.deltaS.every(Number.isNaN));
  assert.equal(c.originM, null);
});
for (const field of [
  "carId",
  "circuitId",
  "layoutId",
  "sessionId",
  "distanceBasis",
  "kind",
])
  test(`isolation: ${field}`, () => {
    const [a, b] = pair();
    if (field === "kind") b.kind = "telemetry-derived";
    else if (field.endsWith("Id") && field !== "sessionId")
      b.context[field] = "other";
    else b.provenance[field] = "other";
    assert.throws(() => compare(a, b));
  });
test("context object property order does not create false incompatibility", () => {
  const [a, b] = pair();
  b.context = Object.fromEntries(Object.entries(b.context).reverse());
  assert.equal(compare(a, b).coverage, 1);
});
test("invalid policy, no overlap, absent channel and excessively fine grid rejected", () => {
  const [a, b] = pair();
  for (const grid_m of [0, NaN, -1, Infinity])
    assert.throws(() => compare(a, b, { grid_m }));
  assert.throws(() => compare(a, b, { grid_m: 0.0001 }));
  b.channels.distanceM.status = "missing";
  assert.throws(() => compare(a, b));
});
test("brake-release and throttle crossing retain measured episode evidence", () => {
  const a = fixture();
  a.samples.forEach((s, i) => {
    s.brake = i >= 10 && i <= 20 ? 0.5 : 0;
    s.throttle = i < 25 ? 0 : 1;
  });
  const zones = brakingZones(a);
  assert.equal(zones.length, 1);
  assert.deepEqual(zones[0], {
    startM: 20,
    endM: 42,
    peakBrake: 0.5,
    minSpeedMps: 20,
    minSpeedAtM: 20,
    throttlePickupM: 50,
    complete: true,
  });
  const b = structuredClone(a);
  b.provenance.lapId = "B";
  b.samples.forEach((s, i) => (s.timeS *= 1 + i * 0.001));
  const c = compare(a, b),
    findings = coach(a, b, c);
  assert.ok(
    findings.every(
      (f) =>
        f.classification === "observation" &&
        f.evidence &&
        f.action &&
        f.confidence,
    ),
  );
});
test("regions exclude any interval containing a delta gap", () => {
  const [a, b] = pair();
  const c = compare(a, b);
  assert.equal(timeRegions(c).length, 1);
  c.deltaS[50] = NaN;
  assert.equal(timeRegions(c).length, 0);
});
test("educational models cannot become measured lap comparisons", () => {
  const [a, b] = pair();
  a.kind = b.kind = "educational";
  assert.throws(() => compare(a, b), /Учебная модель/);
});
test("unfinished braking at the last sample is not assigned a release or gas pickup", () => {
  const a = fixture();
  a.samples.forEach((s, i) => {
    s.brake = i >= 90 ? 0.5 : 0;
    s.throttle = 0;
  });
  const [zone] = brakingZones(a);
  assert.equal(zone.complete, false);
  assert.equal(zone.endM, null);
  assert.equal(zone.throttlePickupM, null);
});
for (const flag of ["metadataComplete", "pitStateKnown"])
  test(`unknown ${flag} blocks comparison but permits individual signal view`, () => {
    const [a, b] = pair();
    const unknown = { profile: a, validation: { [flag]: false } };
    assert.throws(() => compare(unknown, b), /не подтверждены/);
    assert.equal(compare(unknown, unknown).coverage, 1);
  });
test(
  "private oracle assertions: analysis (local opt-in)",
  { skip: !(process.env.APEX_BROWSER_ORACLE && process.env.APEX_PRIVATE_TESTS) },
  async () => {
    const {default: run} = await import(pathToFileURL(`${process.env.APEX_PRIVATE_TESTS}/analysis.mjs`).href);
    await run({assert, existsSync, readFileSync, numericParity, brakingZones, compare, timeRegions, coach});
  },
);