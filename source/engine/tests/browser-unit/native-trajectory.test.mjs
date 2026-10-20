import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateLocal,
  nearestTime,
  localPair,
} from "../../apps/browser-telemetry/src/native-trajectory.js";
const samples = () =>
  Array.from({ length: 101 }, (_, i) => ({
    x: i,
    y: 0,
    timeS: i * 0.1,
    speedMps: 10,
    distanceM: i,
    brake: i < 30 ? 0.5 : 0,
    throttle: i > 40 ? 1 : 0,
  }));
test("local metric supports raw samples, no geospatial/yaw/physical scale assertion", () => {
  const v = validateLocal(samples());
  assert.equal(v.available, true);
  assert.ok(Math.abs(v.metricRatio - 1) < 1e-12);
  assert.equal(v.geographicMapping, false);
  assert.equal(v.physicalScaleVerified, false);
  assert.equal(v.yawVerified, false);
  assert.equal(v.links[0], false);
});
test("teleport/noise breaks edges without repairing coordinates", () => {
  const a = samples();
  a[40].x = 10000;
  const v = validateLocal(a);
  assert.equal(v.jumps, 2);
  assert.equal(v.links[40], false);
  assert.equal(v.links[41], false);
  assert.equal(a[40].x, 10000);
  for (let i = 0; i < a.length; i++) a[i].y = i % 2 ? 50 : 0;
  assert.equal(validateLocal(a).available, false);
});
test("missing samples and large gaps cannot be bridged; bad clock rejects", () => {
  const a = samples();
  a.splice(40, 3);
  assert.equal(validateLocal(a).gaps, 1);
  a[10].timeS = a[9].timeS;
  assert.equal(validateLocal(a).available, false);
  const b = samples();
  b[0].x = null;
  assert.equal(validateLocal(b).available, true);
  assert.equal(validateLocal(b).gaps, 1);
});
test("stationary observations kept; insufficient movement and wrong metric withheld", () => {
  const a = samples();
  for (let i = 40; i < 44; i++) {
    a[i].x = 40;
    a[i].speedMps = 0;
  }
  const v = validateLocal(a);
  assert.ok(v.stationaryIntervals > 0);
  assert.equal(
    validateLocal(a.map((p) => ({ ...p, speedMps: 0, x: 0 }))).available,
    false,
  );
  assert.equal(
    validateLocal(samples().map((p) => ({ ...p, speedMps: 100 }))).available,
    false,
  );
});
test("nearest raw time bounded with no smoothing/extrapolation", () => {
  const a = samples();
  assert.equal(nearestTime(a, 0.23), a[2]);
  assert.equal(nearestTime(a, -0.1), null);
  assert.equal(nearestTime(a, 20), null);
  a.splice(4, 4);
  assert.equal(nearestTime(a, 0.6), null);
});
test("A/B common-frame shape check rejects translations, different frames, jumps", () => {
  const a = {
    ...validateLocal(samples()),
    samples: samples(),
    frame: "same",
    kind: "synthetic",
    lapId: "1",
  };
  const b = {
    ...a,
    lapId: "2",
    samples: samples().map((p) => ({ ...p, y: 2 })),
  };
  assert.equal(localPair(a, b).available, true);
  assert.equal(localPair(a, { ...b, frame: "different" }).available, false);
  assert.equal(
    localPair(a, {
      ...b,
      samples: b.samples.map((p) => ({ ...p, x: p.x + 300 })),
    }).available,
    false,
  );
  assert.equal(localPair(a, { ...b, jumps: 1 }).available, false);
});

test("source adapter preserves isolated missing coordinate as a gap, never zero", async () => {
  const { readPositions } =
    await import("../../apps/browser-telemetry/src/position-source.js");
  const inventory = [
    { name: "GPS Time", rows: 30 },
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
        rows: 3,
      }),
    ),
  ];
  const source = await readPositions(
    async (sql) =>
      sql.includes("SELECT ts")
        ? [{ ts: 0, value: 0 }]
        : [
            {
              latitude: 60,
              longitude: 0,
              timeS: 0,
              speedMps: 10,
              distanceM: 0,
            },
            {
              latitude: null,
              longitude: null,
              timeS: 0.1,
              speedMps: 10,
              distanceM: 1,
            },
            {
              latitude: 60,
              longitude: 0.00004,
              timeS: 0.2,
              speedMps: 10,
              distanceM: 2,
            },
          ],
    { inventory },
  );
  assert.equal(source.samples.length, 3);
  assert.equal(source.samples[1].point, null);
  assert.equal(source.summary.missingIntervals, 2);
});

test("bounded input guards and moderate quantization noise", () => {
  const q = samples().map((p, i) => ({
    ...p,
    x: 3 * i,
    y: i % 2 ? 0.15 : 0,
    speedMps: 30,
  }));
  assert.equal(validateLocal(q).available, true);
  assert.equal(
    validateLocal(
      Array.from({ length: 50001 }, (_, i) => ({
        ...q[0],
        timeS: i * 0.1,
        x: i,
      })),
    ).available,
    false,
  );
});

test("worker pair gate preserves car/layout/session quality policy, one lap remains viewable", async () => {
  const { buildNativePair } =
    await import("../../apps/browser-telemetry/src/native-trajectory.js");
  const context = {
    trackId: "unknown-circuit",
    layoutId: "variant-x",
    vehicleId: "unknown-car",
  };
  const profile = (id) => ({
    kind: "synthetic",
    context: { ...context },
    provenance: { lapId: id, sessionId: "one", distanceBasis: "Lap Dist" },
    channels: { timeS: {}, distanceM: {} },
    samples: samples(),
  });
  const session = {
    id: "one",
    laps: ["1", "2"].map((id) => ({
      profile: profile(id),
      validation: { boundaryDurationS: 10, eligible: true, pit: false },
    })),
  };
  const source = {
    summary: { origin: [0, 60] },
    boundaries: [
      { ts: 0, value: 1 },
      { ts: 10, value: 2 },
    ],
    samples: Array.from({ length: 202 }, (_, i) => ({
      timeS: i * 0.1,
      point: { x: i % 101, y: 0 },
      speedMps: 10,
    })),
  };
  session.laps[1].profile.context.layoutId = "other-layout";
  assert.equal(
    buildNativePair(source, session, "1", "2").pair.available,
    false,
  );
  assert.equal(buildNativePair(source, session, "1", "1").a.available, true);
  session.laps[1].profile.context = { ...context };
  session.laps[1].validation.pit = null;
  assert.equal(
    buildNativePair(source, session, "1", "2").pair.available,
    false,
  );
});

test("A/B nearest-point statistics exclude null coordinates without treating them as origin", () => {
  const a = {
    ...validateLocal(samples()),
    samples: samples(),
    frame: "same",
    kind: "synthetic",
    lapId: "1",
  };
  const b = {
    ...a,
    lapId: "2",
    samples: [...samples(), { x: null, y: null, timeS: 11 }],
  };
  const p = localPair(a, b);
  assert.equal(p.available, true);
  assert.equal(p.medianM, 0);
  assert.equal(p.p95M, 0);
});
