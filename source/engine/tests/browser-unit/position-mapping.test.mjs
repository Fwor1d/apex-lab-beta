import test from "node:test";
import assert from "node:assert/strict";
import {
  localProjection,
  polylineIndex,
  nearestPoint,
  fitRigid,
  assessMapping,
  transformPoint,
  relativeMetrics,
} from "../../apps/browser-telemetry/src/position-mapping.js";
import { readPositions } from "../../apps/browser-telemetry/src/position-source.js";
import { validateContext } from "../../apps/browser-telemetry/src/map-layers.js";
const reference = Array.from({ length: 161 }, (_, i) => {
  const t = (i / 160) * 2 * Math.PI,
    r = 300 + 45 * Math.sin(3 * t) + 15 * Math.cos(5 * t);
  return { x: r * Math.cos(t), y: r * 0.6 * Math.sin(t) };
});
const source = reference.map((p) =>
  transformPoint(p, { rotationRad: 0.7, x: 180, y: -120 }),
);
test("rigid registration: independent synthetic transform; no scaling, reflection or mutation", () => {
  const before = JSON.stringify(source);
  const r = fitRigid(source, reference);
  assert(r.holdout.rmsM < 1);
  assert.equal(r.transform.scale, 1);
  assert.equal(r.transform.reflection, false);
  assert.equal(JSON.stringify(source), before);
});
test("perfect shape alone cannot establish spatial truth", () => {
  const r = assessMapping(reference, reference, { metricRatio: 1 });
  assert.equal(r.status, "reference-alignment-only");
  assert.equal(r.overlaysAllowed, false);
  assert.equal(r.startFinishOffsetM, null);
  assert(r.reasons.some((v) => v.includes("ориентиров")));
});
test("independent evidence gates: missing CRS/layout/geometry uncertainty cannot be bypassed", () => {
  const anchors = [10, 50, 100].map((i) => ({
    source: reference[i],
    target: reference[i],
  }));
  const base = {
    metricRatio: 1,
    evidence: {
      crsVerified: true,
      layoutVerified: true,
      geometryUncertaintyM: 1,
      holdoutAnchors: anchors,
    },
  };
  assert.equal(assessMapping(reference, reference, base).overlaysAllowed, true);
  for (const key of ["crsVerified", "layoutVerified", "geometryUncertaintyM"]) {
    const v = structuredClone(base);
    delete v.evidence[key];
    assert.equal(assessMapping(reference, reference, v).overlaysAllowed, false);
  }
});
test("contradictory anchors or independent speed metric reject an otherwise attractive fit", () => {
  const e = {
    crsVerified: true,
    layoutVerified: true,
    geometryUncertaintyM: 1,
    holdoutAnchors: [1, 30, 100].map((i) => ({
      source: reference[i],
      target: { x: reference[i].x + 100, y: reference[i].y },
    })),
  };
  assert.equal(
    assessMapping(reference, reference, { metricRatio: 1, evidence: e })
      .overlaysAllowed,
    false,
  );
  assert.equal(
    assessMapping(reference, reference, { metricRatio: 1.3, evidence: e })
      .overlaysAllowed,
    false,
  );
});
test("projection validates bounds and retains missing values", () => {
  const p = localProjection(
    [
      [0, 60],
      [0.001, 60],
      [null, 60],
    ],
    [0, 60],
  );
  assert(Math.abs(p[1].x - 55.5974633) < 1e-6);
  assert.equal(p[2], null);
  assert.throws(() => localProjection([[0, 0]], [0, 90]));
});
test("nearest-segment distance is metric and independent of source array indices", () => {
  const idx = polylineIndex([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 0 },
  ]);
  const p = nearestPoint({ x: 25, y: 3 }, idx);
  assert.equal(p.residualM, 3);
  assert.equal(p.distanceM, 25);
});
test("null/gap/clock reversal never contributes to coordinate path or speed integral", () => {
  const r = relativeMetrics([
    { timeS: 0, point: { x: 0, y: 0 }, speedMps: 10 },
    { timeS: 0.1, point: { x: 1, y: 0 }, speedMps: 10 },
    { timeS: 0.6, point: { x: 100, y: 0 }, speedMps: 10 },
    { timeS: 0.5, point: null, speedMps: 10 },
  ]);
  assert.equal(r.pathM, 1);
  assert.equal(r.speedIntegralM, 1);
  assert.equal(r.missingIntervals, 2);
  assert.equal(r.metricRatio, null);
});
test("missing or unmatched native coordinate catalog performs no unsafe SQL", async () => {
  let calls = 0;
  const r = await readPositions(
    () => {
      calls++;
    },
    { inventory: [] },
  );
  assert.equal(r.summary.status, "insufficient");
  assert.equal(calls, 0);
});
test("registration workload guards before unbounded search", () => {
  assert.throws(() =>
    fitRigid(
      Array.from({ length: 50001 }, () => ({ x: 0, y: 0 })),
      reference,
    ),
  );
  assert.throws(() => fitRigid([null, ...reference], reference));
  assert.throws(() =>
    fitRigid(reference, [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]),
  );
});
test("mapped context rejects invented roles, open polygons, invalid units/license and oversized geometry", () => {
  const x = {
    type: "FeatureCollection",
    source: { license: "ODbL-1.0" },
    features: [
      {
        properties: { role: "mapped-pavement" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  };
  assert.equal(validateContext(x).length, 1);
  const y = structuredClone(x);
  y.features[0].properties.role = "racing-line";
  assert.throws(() => validateContext(y));
  const z = structuredClone(x);
  z.features[0].geometry.coordinates[0][3] = [0, 0.1];
  assert.throws(() => validateContext(z));
  const pit = structuredClone(x);
  pit.features[0].properties.role = "mapped-pit-path";
  assert.throws(() => validateContext(pit));
  pit.features[0].geometry = {
    type: "LineString",
    coordinates: x.features[0].geometry.coordinates[0],
  };
  assert.equal(validateContext(pit).length, 1);
});

test("review regression: negative uncertainty, NaN speed ratio and duplicated anchors cannot mint verified status", () => {
  const anchors = [10, 50, 100].map((i) => ({
    source: reference[i],
    target: reference[i],
  }));
  const e = {
    crsVerified: true,
    layoutVerified: true,
    geometryUncertaintyM: 1,
    holdoutAnchors: anchors,
  };
  for (const [metricRatio, evidence] of [
    [NaN, e],
    [1, { ...e, geometryUncertaintyM: -1 }],
    [1, { ...e, holdoutAnchors: [anchors[0], anchors[0], anchors[0]] }],
  ])
    assert.equal(
      assessMapping(reference, reference, { metricRatio, evidence })
        .overlaysAllowed,
      false,
    );
});
test("review regression: null clock never becomes zero-time positional evidence", () => {
  const r = relativeMetrics([
    { timeS: null, point: { x: 0, y: 0 }, speedMps: 50 },
    { timeS: 0.1, point: { x: 5, y: 0 }, speedMps: 50 },
  ]);
  assert.equal(r.intervals, 0);
  assert.equal(r.metricRatio, null);
});

test("invalid coordinate plane disables only optional spatial analysis", async () => {
  const inventory = [
    { name: "GPS Time", rows: 20 },
    ...["GPS Latitude", "GPS Longitude", "GPS Speed", "Lap Dist"].map(
      (name) => ({
        name,
        sourceUnit: name.includes("itude")
          ? "deg"
          : name === "GPS Speed"
            ? "m/s"
            : "m",
        frequencyHz: 10,
        rowidDense: true,
        fields: ["value"],
        rows: 2,
      }),
    ),
  ];
  const r = await readPositions(
    async () => [
      { latitude: 91, longitude: 0, timeS: 1, speedMps: 10, distanceM: 0 },
      { latitude: 91, longitude: 0.1, timeS: 1.1, speedMps: 10, distanceM: 1 },
    ],
    { inventory },
  );
  assert.equal(r.summary.status, "insufficient");
  assert.equal(r.samples.length, 0);
});
