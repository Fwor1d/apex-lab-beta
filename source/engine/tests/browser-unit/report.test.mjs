import assert from "node:assert/strict";
import test from "node:test";
import {
  createReport,
  parseReport,
  reportComparison,
  REPORT_SCHEMA,
} from "../../apps/browser-telemetry/src/report.js";

function profile(id = "A", kind = "telemetry-derived") {
  const channels = Object.fromEntries(
    Object.entries({
      timeS: "s",
      distanceM: "m",
      speedMps: "m/s",
      brake: "ratio",
      throttle: "ratio",
      steeringNormalized: "ratio-signed",
    }).map(([key, unit]) => [
      key,
      {
        unit,
        status:
          kind === "synthetic"
            ? "synthetic"
            : kind === "educational"
              ? "model"
              : "measured",
        sourceChannel: "SYNTHETIC TEST " + key,
      },
    ]),
  );
  return {
    schemaVersion: "1.0.0",
    kind,
    context: {
      carId: "UNKNOWN TEST CAR",
      circuitId: "SYNTHETIC TEST TRACK",
      layoutId: "SYNTHETIC LAYOUT",
    },
    provenance: {
      sourceId: "SYNTHETIC CONTRACT TEST",
      sessionId: "SYNTHETIC SESSION",
      lapId: id,
      sha256: "a".repeat(64),
      distanceBasis: "SYNTHETIC ZERO",
      ...(kind === "synthetic" ? { fixtureLabel: "СИНТЕТИЧЕСКИЙ ТЕСТ" } : {}),
      ...(kind === "educational"
        ? { modelVersion: "SYNTHETIC EDUCATIONAL FIXTURE" }
        : {}),
    },
    channels,
    samples: Array.from({ length: 101 }, (_, i) => ({
      timeS: i / 10,
      distanceM: i * 2,
      speedMps: 20,
      brake: i < 20 ? 0.5 : 0,
      throttle: i < 30 ? 0 : 0.75,
      steeringNormalized: 0.2,
    })),
    lapMetadata: {
      lapNumber: id === "A" ? 1 : 2,
      recordedTimeS: 10,
      eligible: true,
      completed: true,
      pit: false,
      status: "SYNTHETIC CLAIM",
    },
  };
}
const text = (...profiles) => JSON.stringify(createReport(profiles));

test("report round trip preserves signals, missing data and declared units", () => {
  const input = profile();
  input.samples[12].brake = null;
  input.samples[13].distanceM = null;
  const parsed = parseReport(text(input));
  assert.equal(parsed.report, true);
  assert.equal(parsed.metrics.engineLoaded, false);
  assert.equal(parsed.laps.length, 1);
  assert.deepEqual(parsed.laps[0].profile.samples, input.samples);
  assert.equal(
    parsed.laps[0].profile.channels.steeringNormalized.unit,
    "ratio-signed",
  );
  assert.equal(parsed.metadata.TrackName, input.context.circuitId);
  assert.equal(parsed.metadata.TrackLayout, input.context.layoutId);
  assert.equal(parsed.metadata.CarName, input.context.carId);
  assert.equal(parsed.metadata.RecordingTime, "не подтверждено JSON");
});
test("raw portable profile can be opened without loading a DuckDB engine", () => {
  const parsed = parseReport(JSON.stringify(profile()));
  assert.equal(parsed.laps.length, 1);
  assert.equal(parsed.metrics.engineLoaded, false);
});
test("JSON cannot mint verified source or sporting validity", () => {
  const input = profile();
  input.source_verified = true;
  input.certified_valid = true;
  input.lapMetadata.source_verified = true;
  input.lapMetadata.certified_valid = true;
  const object = {
    schemaVersion: REPORT_SCHEMA,
    source_verified: true,
    certified_valid: true,
    profiles: [input],
  };
  const parsed = parseReport(JSON.stringify(object));
  assert.equal(parsed.laps[0].source_verified, false);
  assert.equal(parsed.laps[0].certified_valid, false);
  assert.equal(parsed.fastest, null);
  assert.match(parsed.laps[0].validation.status, /JSON/);
  assert.ok(
    parsed.warnings.some((warning) => warning.includes("исходная база")),
  );
});
test("synthetic profiles stay synthetic and visibly marked", () => {
  const parsed = parseReport(text(profile("A", "synthetic")));
  assert.equal(parsed.laps[0].profile.kind, "synthetic");
  assert.equal(parsed.laps[0].kind, "synthetic");
  assert.equal(parsed.laps[0].source_verified, false);
  assert.match(parsed.laps[0].profile.provenance.fixtureLabel, /СИНТЕТИЧЕСКИЙ/);
});
test("export privacy allowlist strips unknown nested personal fields", () => {
  const input = profile();
  input.DriverName = "PRIVATE DRIVER";
  input.context.DriverName = "PRIVATE DRIVER";
  input.provenance.absoluteSourcePath = "/PRIVATE/PERSONAL/FILE.duckdb";
  input.channels.speedMps.DriverName = "PRIVATE DRIVER";
  input.channels.speedMps.sampling = {
    nativeFrequencyHz: 100,
    sourceUnit: "km/h",
    method: "SYNTHETIC TEST",
    timeUncertaintyS: 0.01,
    SteamID: "PRIVATE ID",
  };
  input.lapMetadata.DriverName = "PRIVATE DRIVER";
  input.sampling = { DriverName: "PRIVATE DRIVER" };
  const serialized = text(input);
  assert.ok(!serialized.includes("PRIVATE"));
  const exported = JSON.parse(serialized).profiles[0];
  assert.equal(exported.channels.speedMps.sampling.nativeFrequencyHz, 100);
  assert.equal(exported.channels.speedMps.sampling.timeUncertaintyS, 0.01);
  assert.equal(exported.lapMetadata.recordedTimeS, 10);
});
test("opening an arbitrary report also strips private extension fields", () => {
  const input = profile();
  input.provenance.DriverName = "PRIVATE DRIVER";
  input.context.SteamID = "PRIVATE ID";
  input.lapMetadata.privatePath = "/PRIVATE/FILE.duckdb";
  const parsed = parseReport(
    JSON.stringify({ schemaVersion: REPORT_SCHEMA, profiles: [input] }),
  );
  assert.ok(!JSON.stringify(parsed).includes("PRIVATE"));
});
for (const [field, change] of [
  ["car", (p) => (p.context.carId = "OTHER CAR")],
  ["circuit", (p) => (p.context.circuitId = "OTHER TRACK")],
  ["layout", (p) => (p.context.layoutId = "OTHER LAYOUT")],
  ["session", (p) => (p.provenance.sessionId = "OTHER SESSION")],
  ["distance basis", (p) => (p.provenance.distanceBasis = "OTHER ZERO")],
])
  test("incompatible " + field + " is not merged or compared", () => {
    const a = profile("A"),
      b = profile("B");
    change(b);
    assert.throws(() => parseReport(text(a, b)));
  });
test("different data classes are never mixed", () => {
  assert.throws(() =>
    parseReport(text(profile("A"), profile("B", "synthetic"))),
  );
});
test("educational model cannot masquerade as measured report", () => {
  const model = profile("A", "educational");
  assert.throws(() => parseReport(JSON.stringify(model)), /Учебная модель/);
  assert.throws(() => createReport([model]), /Учебная модель/);
});
test("self-view has no comparative coaching claims", () => {
  const session = parseReport(text(profile()));
  const result = reportComparison(session, "A", "A");
  assert.deepEqual(result.pair, ["A", "A"]);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.regions, []);
  assert.ok(
    [...result.comparison.deltaS].every(
      (value) => Number.isNaN(value) || value === 0,
    ),
  );
});
test("unknown selected lap produces a meaningful error", () => {
  const session = parseReport(text(profile()));
  assert.throws(
    () => reportComparison(session, "not-in-report", "A"),
    /Круг отсутствует/,
  );
});
for (const content of [
  "{",
  "null",
  "42",
  "[]",
  '{"schemaVersion":"unknown"}',
  '{"schemaVersion":"apex-report/1.0","profiles":[]}',
])
  test(
    "corrupted or unsupported JSON rejected: " + content.slice(0, 20),
    () => {
      assert.throws(() => parseReport(content), Error);
    },
  );
test("report cardinality and duplicate lap selection are validated", () => {
  assert.throws(() => createReport([]));
  assert.throws(() => createReport([profile("A"), profile("B"), profile("C")]));
  assert.throws(() =>
    parseReport(
      JSON.stringify({
        schemaVersion: REPORT_SCHEMA,
        profiles: [profile("A"), profile("A")],
      }),
    ),
  );
});
for (const mutation of [
  (p) => (p.channels.brake.unit = "%"),
  (p) => (p.channels.brake.status = "model"),
  (p) => (p.provenance.sha256 = "invalid"),
  (p) => (p.samples[10].speedMps = "20"),
  (p) => (p.samples[10].brake = 2),
  (p) => (p.samples[10].timeS = -1),
  (p) => (p.samples[10].distanceM = -1),
])
  test("portable contract rejects invalid units/kind/values", () => {
    const input = profile();
    mutation(input);
    assert.throws(() => parseReport(JSON.stringify(input)));
  });

test("lap-boundary and sequence evidence survives portable export", () => {
  const input = profile();
  Object.assign(input.lapMetadata, {
    lapNumber: 7,
    boundaryDurationS: 10.003,
    lapSequenceContinuous: true,
  });
  const output = JSON.parse(text(input)).profiles[0].lapMetadata;
  assert.equal(output.lapNumber, 7);
  assert.equal(output.boundaryDurationS, 10.003);
  assert.equal(output.lapSequenceContinuous, true);
});
for (const change of [
  (lap) => (lap.validation.pit = true),
  (lap) => (lap.validation.pit = null),
  (lap) => (lap.validation.eligible = false),
  (lap) => (lap.validation.eligible = undefined),
])
  test("reports cannot compare claimed pit/incomplete laps as normal laps", () => {
    const session = parseReport(text(profile("A"), profile("B")));
    change(session.laps[1]);
    assert.throws(
      () => reportComparison(session, "A", "B"),
      /нельзя сравнивать/,
    );
    const single = reportComparison(session, "B", "B");
    assert.ok([...single.comparison.deltaS].every(Number.isNaN));
    assert.equal(single.comparison.coverage, 0);
    assert.deepEqual(single.findings, []);
  });
test("large report and excessive sample count are rejected before analysis", () => {
  assert.throws(() => parseReport(" ".repeat(32 * 1024 * 1024 + 1)), /32 МиБ/);
  const a = profile("A"),
    b = profile("B");
  a.samples = Array(125001).fill(a.samples[0]);
  b.samples = Array(125001).fill(b.samples[0]);
  assert.throws(() => createReport([a, b]), /250000/);
});

function enhanced() {
  const a = profile("A"),
    b = profile("B");
  b.samples = b.samples.map((s) => ({ ...s, timeS: s.timeS * 1.2 }));
  b.lapMetadata.recordedTimeS = 12;
  const session = parseReport(text(a, b));
  return createReport([a, b], {
    coaching: reportComparison(session, "A", "B").coaching,
    metadata: {
      CarClass: "GT3",
      DriverName: "PRIVATE DRIVER",
      SteamID: "PRIVATE ID",
    },
  });
}
test("coaching extension is compact, metadata allowlisted and older report remains compatible", () => {
  const report = enhanced();
  assert.equal(report.extensions.coaching.schemaVersion, "1.0.0");
  assert.ok(report.extensions.coaching.findings.length);
  assert.deepEqual(report.extensions.recordingMetadata, { CarClass: "GT3" });
  assert.ok(!JSON.stringify(report).includes("PRIVATE"));
  const parsed = parseReport(JSON.stringify(report));
  assert.equal(parsed.metrics.coachingSnapshot, true);
  assert.equal(parsed.metadata.CarClass, "GT3");
  const older = { ...report };
  delete older.extensions;
  assert.equal(
    parseReport(JSON.stringify(older)).metrics.coachingSnapshot,
    false,
  );
});
test("stored coaching certainty and hostile text are ignored and findings recomputed", () => {
  const report = enhanced();
  report.extensions.coaching.findings[0].explanation =
    "<img src=x onerror=alert(1)> collision PROVEN";
  const session = parseReport(JSON.stringify(report));
  const result = reportComparison(session, "A", "B");
  assert.ok(!JSON.stringify(result.coaching).includes("PROVEN"));
  assert.ok(!JSON.stringify(session).includes("<img"));
  assert.equal(session.laps[0].source_verified, false);
  assert.equal(session.laps[0].certified_valid, false);
});
for (const mutation of [
  (r) => r.extensions.coaching.findings[0].distanceRangeM.reverse(),
  (r) => (r.extensions.coaching.findings[0].measured.a.minSpeedMps = "fast"),
  (r) =>
    (r.extensions.coaching.findings[0].classification = "proven-collision"),
  (r) => r.extensions.coaching.findings.push(r.extensions.coaching.findings[0]),
  (r) => r.extensions.coaching.sections[0].findingIds.push("not-present"),
])
  test("malformed known coaching extension fails safely", () => {
    const report = enhanced();
    mutation(report);
    assert.throws(() => parseReport(JSON.stringify(report)), Error);
  });
test("unknown future coaching schema is ignored without granting authenticity", () => {
  const report = enhanced();
  report.extensions.coaching = { schemaVersion: "99.0", text: "untrusted" };
  const session = parseReport(JSON.stringify(report));
  assert.equal(session.metrics.coachingSnapshot, false);
  assert.equal(session.laps[0].source_verified, false);
});
test("UTF-8 byte size is enforced in addition to UTF-16 text length", () => {
  assert.throws(() => parseReport("€".repeat(12 * 1024 * 1024)), /32 МиБ/);
});

for (const key of ["TrackName", "TrackLayout", "CarName"])
  test("recorder-v1 header contradictions are rejected: " + key, () => {
    const a = profile("A"),
      b = profile("B");
    for (const p of [a, b]) {
      p.provenance.sourceId = "lmu-recorder-v1";
      p.context.carId = "RECORDED CAR / GT3";
    }
    const report = createReport([a, b], {
      metadata: {
        TrackName: a.context.circuitId,
        TrackLayout: a.context.layoutId,
        CarName: "RECORDED CAR",
        CarClass: "GT3",
      },
    });
    report.extensions.recordingMetadata[key] = "CONTRADICTORY";
    assert.throws(() => parseReport(JSON.stringify(report)), /противореч/);
  });
