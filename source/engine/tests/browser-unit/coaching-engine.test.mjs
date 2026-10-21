import {pathToFileURL} from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCoaching } from "../../apps/browser-telemetry/src/coaching-engine.js";
import {
  compare,
  coach,
  timeRegions,
  toPortableNumbers,
} from "../../apps/browser-telemetry/src/analysis.js";

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
      context: {
        carId: "unknown-car",
        circuitId: "generic-track",
        layoutId: "unknown-layout",
      },
      provenance: {
        sourceId: "test",
        sessionId: "test-session",
        lapId: id,
        distanceBasis: "recorded",
      },
      channels: Object.fromEntries(
        keys.map((key) => [
          key,
          {
            status: "synthetic",
            sampling: { nativeFrequencyHz: 10, timeUncertaintyS: 0.1 },
          },
        ]),
      ),
      samples: Array.from({ length: 301 }, (_, i) => ({
        distanceM: i * 2,
        timeS: i * 0.1,
        speedMps: 20,
        brake: i >= 30 && i <= 49 ? 0.6 - (i - 30) * 0.02 : 0,
        throttle: i < 70 ? 0 : 0.8,
        steeringNormalized: 0,
      })),
    },
    validation: { eligible: true, recordedTimeS: 30, pit: false },
  };
}
function pair() {
  return [lap(), lap("B")];
}
function run(a, b, options) {
  return buildCoaching(a, b, compare(a, b), options);
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test("deterministic compact additive JSON preserves frozen inputs and legacy evidence", () => {
  const [a, b] = pair();
  b.profile.samples.forEach((s) => {
    s.timeS *= 1.1;
  });
  const c = compare(a, b),
    legacy = coach(a, b, c);
  const snapshot = JSON.stringify(toPortableNumbers({ a, b, c, legacy }));
  freeze(a);
  freeze(b);
  freeze(legacy);
  const result = buildCoaching(a, b, c, {
    laps: [a, b],
    legacyFindings: legacy,
  });
  assert.deepEqual(
    result,
    buildCoaching(a, b, c, { laps: [a, b], legacyFindings: legacy }),
  );
  assert.equal(
    snapshot,
    JSON.stringify(toPortableNumbers({ a, b, c, legacy })),
  );
  assert.equal(result.schemaVersion, "1.0.0");
  assert.equal(result.legacyEvidenceCount, legacy.length);
  assert.ok(!JSON.stringify(result).includes('"samples"'));
  assert.equal(result.consistency.eligibleLapCount, 2);
  assert.equal(result.consistency.status, "insufficient-data");
  assert.ok(
    result.findings.every(
      (f) =>
        f.reference.ideal === false &&
        f.measured.signals.every((s) => s.name && s.unit),
    ),
  );
  assert.ok(
    result.findings.every(
      (f) => f.category === "time-region" || f.timeImpactS === null,
    ),
  );
});

test("identical observed signals produce no technique false positives", () => {
  const [a, b] = pair();
  assert.deepEqual(run(a, b).findings, []);
});

test("signed steering unit fallback remains explicit when channel descriptor is absent", () => {
  const [a, b] = pair();
  delete a.profile.channels.steeringNormalized;
  delete b.profile.channels.steeringNormalized;
  b.profile.samples.forEach((s) => {
    s.timeS *= 1.1;
  });
  const finding = run(a, b).findings.find((f) => f.category === "time-region");
  const signal = finding.measured.signals.find(
    (s) => s.name === "steeringNormalized",
  );
  assert.equal(signal.unit, "ratio-signed");
  assert.equal(finding.measured.a.maxAbsSteering, null);
});

test("brake onset within sampling bound or with missing uncertainty is inconclusive", () => {
  const [a, b] = pair();
  b.profile.samples.forEach((s, i) => {
    s.brake = i >= 33 && i <= 52 ? 0.6 - (i - 33) * 0.02 : 0;
  });
  const finding = run(a, b).findings.find((f) => f.category === "brake-onset");
  assert.equal(finding.classification, "inconclusive");
  assert.equal(finding.uncertainty.timingDistanceBoundM, 8);
  delete a.profile.channels.distanceM.sampling.timeUncertaintyS;
  const unknown = run(a, b).findings.find((f) => f.category === "brake-onset");
  assert.equal(unknown.classification, "inconclusive");
  assert.equal(unknown.uncertainty.timingDistanceBoundM, null);
});

test("throttle requires continuous 0.3s above threshold, a crossing spike is withheld", () => {
  const [a, b] = pair();
  b.profile.samples.forEach((s, i) => {
    s.throttle = i === 55 || i >= 80 ? 0.8 : 0;
  });
  const found = run(a, b).findings.find(
    (f) => f.category === "sustained-throttle",
  );
  assert.equal(found.measured.a.sustainedThrottleM, 140);
  assert.equal(found.measured.b.sustainedThrottleM, 160);
  b.profile.samples.forEach((s, i) => {
    s.throttle = i === 55 ? 0.8 : 0;
  });
  const withheld = run(a, b);
  assert.ok(
    !withheld.findings.some((f) => f.category === "sustained-throttle"),
  );
  assert.ok(
    withheld.withheld.some((v) => v.code === "missing-sustained-throttle"),
  );
});

test("null braking / reversed / stationary distances never create complete crossing episodes", () => {
  for (const change of [
    (p) => {
      p.samples[40].brake = null;
    },
    (p) => {
      p.samples[40].distanceM = p.samples[39].distanceM - 1;
    },
    (p) => {
      p.samples[40].distanceM = p.samples[39].distanceM;
    },
  ]) {
    const [a, b] = pair();
    change(b.profile);
    b.profile.samples.forEach((s) => {
      if (s.brake !== null) s.brake *= 0.5;
    });
    assert.ok(!run(a, b).findings.some((f) => f.category === "brake-peak"));
  }
});

test("missing channels, frequency, and gaps withhold derivatives and do not fabricate zero", () => {
  const [a, b] = pair();
  b.profile.channels.throttle.status = "missing";
  b.profile.samples.forEach((s, i) => {
    if (i > 50) s.speedMps += i * 0.1;
  });
  delete b.profile.channels.speedMps.sampling.nativeFrequencyHz;
  const result = run(a, b);
  assert.ok(result.withheld.some((v) => v.code === "missing-low-throttle"));
  assert.ok(
    result.withheld.some((v) => v.code === "missing-exit-acceleration"),
  );
  assert.ok(!result.findings.some((f) => f.category === "exit-acceleration"));
});

test("coverage for release, peaks, overlaps, observed speed, exit acceleration and steering", () => {
  const [a, b] = pair();
  b.profile.samples.forEach((s, i) => {
    if (i >= 30 && i <= 59) s.brake = i < 45 ? 0.9 : 0.9 - (i - 45) * 0.045;
    else s.brake = 0;
    s.throttle = i >= 40 && i < 55 ? 0.5 : i < 90 ? 0 : 0.8;
    s.speedMps = i >= 30 && i <= 60 ? 15 : i > 60 ? 15 + (i - 60) * 0.3 : 20;
    s.steeringNormalized = i >= 30 && i <= 59 ? (i % 4 < 2 ? 0.5 : -0.5) : 0;
  });
  const categories = new Set(run(a, b).findings.map((f) => f.category));
  for (const category of [
    "brake-peak",
    "brake-duration",
    "progressive-release",
    "pedal-overlap",
    "steering-overlap",
    "entry-speed",
    "speed-minimum",
    "recovery-speed",
    "low-throttle",
    "exit-acceleration",
    "steering-activity",
  ])
    assert.ok(categories.has(category), category);
});

test("stationary steering samples cannot become measured correction activity", () => {
  const [a, b] = pair();
  b.profile.samples.forEach((s, i) => {
    s.speedMps = 0;
    s.steeringNormalized = i % 2 ? 1 : -1;
  });
  const result = run(a, b);
  assert.ok(!result.findings.some((f) => f.category === "steering-activity"));
});

test("repeated braking is bounded, not merged into an extrapolated exit", () => {
  const [a, b] = pair();
  b.profile.samples.forEach((s, i) => {
    if (i >= 60 && i <= 65) s.brake = 0.5;
  });
  const result = run(a, b);
  assert.ok(result.findings.every((f) => f.distanceRangeM[1] <= 600));
  assert.equal(
    new Set(result.findings.map((f) => f.id)).size,
    result.findings.length,
  );
});

test("incompatible and self view have no comparative coaching or imported claims", () => {
  const [a, b] = pair();
  assert.equal(run(a, a).mode, "self-view");
  b.profile.context.layoutId = "other";
  const result = buildCoaching(a, b, null, {
    legacyFindings: [{ category: "spin", text: "fabricated" }],
  });
  assert.equal(result.mode, "withheld");
  assert.equal(result.findings.length, 0);
  assert.ok(!JSON.stringify(result).includes("fabricated"));
});

test("time windows reuse legacy timeRegions, technique never separately attributes loss", () => {
  const [a, b] = pair();
  b.profile.samples.forEach((s) => {
    s.timeS *= 1.2;
  });
  const c = compare(a, b),
    result = buildCoaching(a, b, c);
  assert.deepEqual(
    result.sections.map((s) => [...s.distanceRangeM, s.timeImpactS]),
    timeRegions(c).map((r) => [r.startM, r.endM, r.changeS]),
  );
  const sorted = [...result.sections].sort(
    (x, y) => x.distanceRangeM[0] - y.distanceRangeM[0],
  );
  assert.ok(
    sorted.every(
      (s, i) => !i || s.distanceRangeM[0] >= sorted[i - 1].distanceRangeM[1],
    ),
  );
});

test("consistency requires three distinct eligible same-context laps and remains descriptive", () => {
  const [a, b] = pair(),
    c = lap("C"),
    other = lap("D");
  b.validation.recordedTimeS = 31;
  c.validation.recordedTimeS = 32;
  other.profile.context.carId = "other";
  assert.equal(
    run(a, b, { laps: [a, b, other] }).consistency.status,
    "insufficient-data",
  );
  assert.equal(run(a, b, { laps: [a, a, b] }).consistency.eligibleLapCount, 2);
  const consistency = run(a, b, { laps: [a, b, c, other] }).consistency;
  assert.equal(consistency.status, "descriptive");
  assert.equal(consistency.metrics.recordedTimeRangeS, 2);
  assert.equal(consistency.metrics.recordedTimeMedianS, 31);
});

test("eligible flag cannot make null or unknown pit state eligible for descriptive consistency", () => {
  const [a, b] = pair(),
    c = lap("C");
  for (const pit of [null, undefined, "unknown", 0, true]) {
    c.validation.pit = pit;
    const result = run(a, b, { laps: [a, b, c] });
    assert.equal(result.consistency.status, "insufficient-data");
    assert.equal(result.consistency.eligibleLapCount, 2);
    assert.equal(result.consistency.metrics, null);
    assert.ok(
      result.withheld.some((v) => v.code === "consistency-insufficient"),
    );
  }
  c.validation.pit = false;
  assert.equal(
    run(a, b, { laps: [a, b, c] }).consistency.status,
    "descriptive",
  );
});

test("unvalidated event semantics do not create ABS, TC or collision diagnosis", () => {
  const [a, b] = pair();
  a.events = { ABS: true, LastImpactMagnitude: true, WheelsDetached: 1 };
  const result = run(a, b);
  assert.ok(result.withheld.some((v) => v.code === "physical-causes"));
  assert.ok(
    !result.findings.some((f) => /collision|ABS|oversteer/.test(f.category)),
  );
});

test("hostile comparison endpoints and nonfinite or nonmonotone grids are bounded before region loops", () => {
  const [a, b] = pair();
  for (const distances of [
    [0, 1e100],
    [0, null],
    [0, 2, 1],
    [0, 30000],
  ]) {
    const c = {
      distanceM: distances,
      deltaS: distances.map(() => 0),
      policy: { grid_m: 1e100, max_distance_gap_m: 25, max_time_gap_s: 0.25 },
    };
    assert.equal(buildCoaching(a, b, c).mode, "withheld");
  }
});

test(
  "private oracle assertions: coaching-engine (local opt-in)",
  { skip: !(process.env.APEX_BROWSER_ORACLE && process.env.APEX_PRIVATE_TESTS) },
  async () => {
    const {default: run} = await import(pathToFileURL(`${process.env.APEX_PRIVATE_TESTS}/coaching-engine.mjs`).href);
    await run({assert, readFileSync, compare, toPortableNumbers, coach, buildCoaching});
  },
);