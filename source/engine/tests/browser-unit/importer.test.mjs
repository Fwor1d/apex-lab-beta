import assert from "node:assert/strict";
import test from "node:test";
import {
  importSession,
  sampleAt,
  eventState,
  seriesQuality,
} from "../../apps/browser-telemetry/src/importer.js";

// Explicitly synthetic query fixture; it tests decoding policy, never native-file access.
function fixture() {
  const tables = new Map();
  const add = (name, fields, rows) =>
    tables.set(name, { fields, rows, rowids: rows.map((_, i) => i) });
  add(
    "metadata",
    ["key", "value"],
    Object.entries({
      Version: "1",
      RecordingTime: "2026-10-09T00_00_00Z",
      SessionType: "Practice",
      TrackName: "SYNTHETIC TRACK",
      TrackLayout: "TEST LAYOUT",
      CarName: "UNKNOWN FUTURE VEHICLE",
      CarClass: "TEST CLASS",
      DriverName: "PRIVATE TEST DRIVER",
      APEXDataKind: "synthetic",
    }).map(([key, value]) => ({ key, value })),
  );
  const channels = [
    ["GPS Time", 100, "s"],
    ["Ground Speed", 100, "km/h"],
    ["Brake Pos", 50, "%"],
    ["Throttle Pos", 50, "%"],
    ["Steering Pos", 100, "%"],
    ["Lap Dist", 10, "m"],
  ];
  add(
    "channelsList",
    ["channelName", "frequency", "unit"],
    channels.map(([channelName, frequency, unit]) => ({
      channelName,
      frequency,
      unit,
    })),
  );
  for (const [name, frequency] of channels)
    add(
      name,
      ["value"],
      Array.from({ length: 30 * frequency }, (_, i) => ({
        value:
          name === "GPS Time"
            ? 100 + i / 100
            : name === "Ground Speed"
              ? 72
              : name === "Brake Pos"
                ? 25
                : name === "Throttle Pos"
                  ? 40
                  : name === "Steering Pos"
                    ? -50
                    : (i % 100) * 10,
      })),
    );
  const events = [
    [
      "Lap",
      "",
      [
        [100, 0],
        [110, 1],
        [120, 2],
      ],
    ],
    [
      "Lap Time",
      "s",
      [
        [100, 0],
        [110, 10],
        [120, 10],
      ],
    ],
    ["In Pits", "", [[100, 0]]],
  ];
  add(
    "eventsList",
    ["eventName", "unit"],
    events.map(([eventName, unit]) => ({ eventName, unit })),
  );
  for (const [name, , observations] of events)
    add(
      name,
      ["ts", "value"],
      observations.map(([ts, value]) => ({ ts, value })),
    );
  const query = async (sql) => {
    if (sql.includes("information_schema.tables"))
      return [...tables.keys()].map((table_name) => ({ table_name }));
    if (sql.includes("information_schema.columns"))
      return [...tables.entries()].flatMap(([table_name, table]) =>
        table.fields.map((column_name, i) => ({
          table_name,
          column_name,
          data_type: "DOUBLE",
          ordinal_position: i + 1,
        })),
      );
    const name = / FROM ("(?:[^"]|"")+"|\w+)/
      .exec(sql)?.[1]
      .replace(/^"|"$/g, "")
      .replaceAll('""', '"');
    const table = tables.get(name);
    if (!table) throw Error("Неизвестный fixture SQL: " + sql);
    if (sql.startsWith("SELECT count(*)"))
      return [
        {
          rows: table.rows.length,
          ...Object.fromEntries(
            table.fields.map((field, i) => [
              `n${i}`,
              table.rows.filter((row) => row[field] === null).length,
            ]),
          ),
        },
      ];
    if (sql.startsWith("SELECT min(rowid)"))
      return [
        { first: table.rowids[0] ?? null, last: table.rowids.at(-1) ?? null },
      ];
    if (sql.startsWith("SELECT min(value)")) {
      const values = table.rows
        .map((row) => row.value)
        .filter((value) => value !== null);
      return [
        {
          minimum: values.length ? Math.min(...values) : null,
          maximum: values.length ? Math.max(...values) : null,
        },
      ];
    }
    if (name === "metadata")
      return table.rows.filter((row) => sql.includes("'" + row.key + "'"));
    const rows = sql.includes("ORDER BY ts")
      ? [...table.rows].sort((a, b) => a.ts - b.ts)
      : table.rows;
    return rows.slice(0, Number(/ LIMIT (\d+)/.exec(sql)?.[1] ?? Infinity));
  };
  return { tables, query };
}
const digest = "a".repeat(64);
const run = (data) => importSession(data.query, { sha256: digest });

test("synthetic oversized clock: existing 500000 guard explains the limit", async () => {
  const data = fixture();
  const query = async (sql) =>
    sql === 'SELECT value FROM "GPS Time" ORDER BY rowid LIMIT 500001'
      ? Array.from({ length: 500001 }, (_, i) => ({ value: i / 100 }))
      : data.query(sql);
  await assert.rejects(
    importSession(query, { sha256: digest }),
    /500 000.*83 минут/,
  );
});

test("synthetic Version 1: reconstructed clocks, units, metadata, lap policy", async () => {
  const session = await run(fixture());
  assert.equal(session.metadata.recordingUTC, "2026-10-09T00:00:00+00:00");
  assert.equal(session.metadata.DriverName, undefined);
  assert.equal(session.schema.tableCount, 12);
  assert.equal(session.laps.length, 3);
  const lap = session.laps[1],
    sample = lap.profile.samples[0];
  assert.equal(lap.profile.kind, "synthetic");
  assert.equal(lap.source_verified, false);
  assert.equal(lap.certified_valid, false);
  assert.equal(session.fastest, null);
  assert.equal(lap.validation.eligible, true);
  assert.equal(sample.timeS, 0);
  assert.equal(sample.speedMps, 20);
  assert.equal(sample.brake, 0.25);
  assert.equal(sample.throttle, 0.4);
  assert.equal(sample.steeringNormalized, -0.5);
  assert.equal(sample.distanceM, 0);
  assert.equal(lap.profile.samples.at(-1).distanceM, null);
  assert.equal(
    lap.profile.context.carId,
    "UNKNOWN FUTURE VEHICLE / TEST CLASS",
  );
  assert.ok(Math.abs(session.quality.brake.medianIntervalS - 0.02) < 1e-12);
  assert.equal(lap.profile.channels.brake.sampling.timeUncertaintyS, 0.02);
});
for (const issue of [
  "missing-table",
  "wrong-unit",
  "wrong-frequency",
  "missing-row",
  "rowid-hole",
])
  test("brake remains null: " + issue, async () => {
    const data = fixture(),
      channel = data.tables
        .get("channelsList")
        .rows.find((row) => row.channelName === "Brake Pos");
    if (issue === "missing-table") data.tables.delete("Brake Pos");
    if (issue === "wrong-unit") channel.unit = "unknown";
    if (issue === "wrong-frequency") channel.frequency = 7;
    if (issue === "missing-row") data.tables.get("Brake Pos").rows.pop();
    if (issue === "rowid-hole") data.tables.get("Brake Pos").rowids[0] = 2;
    const session = await run(data),
      lap = session.laps[1];
    assert.equal(lap.profile.channels.brake.status, "missing");
    assert.ok(lap.profile.samples.every((sample) => sample.brake === null));
  });
test("raw nulls are never silently converted to zero", async () => {
  const data = fixture();
  data.tables.get("Brake Pos").rows[520].value = null;
  const lap = (await run(data)).laps[1];
  assert.ok(
    lap.profile.samples.slice(39, 42).every((row) => row.brake === null),
  );
});
test("distance regressions remain null until monotonic observations recover", async () => {
  const data = fixture();
  data.tables.get("Lap Dist").rows[120].value = 180;
  const lap = (await run(data)).laps[1];
  assert.ok(lap.validation.distanceRegressions > 0);
  assert.equal(lap.validation.eligible, true);
  const distances = lap.profile.samples
    .map((row) => row.distanceM)
    .filter((value) => value !== null);
  assert.ok(distances.every((value, i) => !i || value >= distances[i - 1]));
});
for (const missing of ["Lap Dist", "Lap Time", "In Pits", "Ground Speed"])
  test("missing " + missing + " cannot certify lap", async () => {
    const data = fixture();
    data.tables.delete(missing);
    const session = await run(data);
    assert.ok(session.laps.every((lap) => !lap.validation.eligible));
  });
test("positive pit lap stays excluded", async () => {
  const data = fixture();
  data.tables.get("In Pits").rows = [
    { ts: 100, value: 0 },
    { ts: 111, value: 1 },
    { ts: 119, value: 0 },
  ];
  const lap = (await run(data)).laps[1];
  assert.equal(lap.validation.pit, true);
  assert.equal(lap.validation.eligible, false);
  assert.equal(lap.validation.recordedTimeS, 10);
});
test("skipped event number cannot create a valid composite lap", async () => {
  const data = fixture();
  data.tables.get("Lap").rows[2].value = 4;
  const lap = (await run(data)).laps[1];
  assert.equal(lap.validation.lapSequenceContinuous, false);
  assert.equal(lap.validation.eligible, false);
});
for (const issue of [
  "duplicate-clock",
  "null-clock",
  "rowid-clock",
  "duplicate-event",
  "null-event",
  "fractional-lap",
  "version",
  "bad-date",
  "metadata-conflict",
])
  test("reject ambiguous or unsupported " + issue, async () => {
    const data = fixture();
    if (issue === "duplicate-clock")
      data.tables.get("GPS Time").rows[1].value = 100;
    if (issue === "null-clock")
      data.tables.get("GPS Time").rows[1].value = null;
    if (issue === "rowid-clock") data.tables.get("GPS Time").rowids[0] = 10;
    if (issue === "duplicate-event")
      data.tables.get("Lap").rows.push({ ts: 110, value: 9 });
    if (issue === "null-event") data.tables.get("Lap").rows[1].ts = null;
    if (issue === "fractional-lap") data.tables.get("Lap").rows[1].value = 1.5;
    if (issue === "version")
      data.tables
        .get("metadata")
        .rows.find((row) => row.key === "Version").value = "2";
    if (issue === "bad-date")
      data.tables
        .get("metadata")
        .rows.find((row) => row.key === "RecordingTime").value =
        "2026-02-30T00_00_00Z";
    if (issue === "metadata-conflict")
      data.tables
        .get("metadata")
        .rows.push({ key: "CarName", value: "contradiction" });
    await assert.rejects(run(data));
  });
test("table inventory excludes views through BASE TABLE-only query", async () => {
  const data = fixture();
  let seen = false;
  const query = async (sql) => {
    if (sql.includes("information_schema.tables")) {
      seen =
        sql.includes("table_type='BASE TABLE'") &&
        sql.includes("table_catalog=current_database()");
    }
    return data.query(sql);
  };
  await importSession(query, { sha256: digest });
  assert.ok(seen);
});
test("interpolation preserves null, reset, gap and out-of-range observations", () => {
  assert.deepEqual(
    [...sampleAt([0, 1], [0, 10], [-1, 0, 0.5, 1, 2], 2)].map((value) =>
      Number.isNaN(value) ? null : value,
    ),
    [null, 0, 5, 10, null],
  );
  assert.ok(Number.isNaN(sampleAt([0, 1], [10, 0], [0.5], 2, true)[0]));
  assert.ok(Number.isNaN(sampleAt([0, 1], [0, null], [0.5], 2)[0]));
  assert.ok(Number.isNaN(sampleAt([0, 1], [0, 10], [0.5], 0.2)[0]));
});
test("event states are as-of, quality uses verified clocks", () => {
  assert.equal(
    eventState(
      [
        { ts: 1, value: 3 },
        { ts: 3, value: 4 },
      ],
      2,
    ),
    3,
  );
  assert.equal(eventState([{ ts: 1, value: 3 }], 0), null);
  assert.equal(
    seriesQuality([0, 0, 1, 0.5], [0, null, 1, 2]).duplicateAdjacentTimestamps,
    1,
  );
  assert.equal(
    seriesQuality([0, 0, 1, 0.5], [0, null, 1, 2]).reversedAdjacentTimestamps,
    1,
  );
});

for (const value of [null, 2, -1, "0"])
  test("unknown pit state cannot prove no pit: " + String(value), async () => {
    const data = fixture();
    data.tables.get("In Pits").rows = [{ ts: 100, value }];
    const session = await run(data);
    assert.ok(session.laps.every((lap) => !lap.validation.eligible));
    assert.ok(session.laps.every((lap) => lap.validation.pit === null));
    assert.ok(
      session.laps.every((lap) => lap.validation.pitStateKnown === false),
    );
    assert.ok(
      session.warnings.some((warning) =>
        warning.includes("неизвестные значения"),
      ),
    );
  });
test("known pit state after an unknown interval only certifies later laps", async () => {
  const data = fixture();
  data.tables.get("In Pits").rows = [
    { ts: 100, value: null },
    { ts: 105, value: 0 },
  ];
  const session = await run(data);
  assert.equal(session.laps[0].validation.eligible, false);
  assert.equal(session.laps[1].validation.eligible, true);
});
for (const key of ["CarName", "CarClass", "TrackName", "TrackLayout"])
  test(
    "unknown " + key + " remains explicit and blocks comparison",
    async () => {
      const data = fixture();
      data.tables.get("metadata").rows = data.tables
        .get("metadata")
        .rows.filter((row) => row.key !== key);
      const session = await run(data);
      assert.equal(session.metadata[key], "не установлено");
      assert.equal(session.comparisonAllowed, false);
      assert.ok(session.laps.every((lap) => !lap.validation.eligible));
      assert.ok(
        session.laps.every((lap) => lap.validation.metadataComplete === false),
      );
      assert.ok(
        session.laps[1].profile.samples.some(
          (sample) => sample.speedMps === 20,
        ),
      );
      assert.ok(
        session.warnings.some((warning) =>
          warning.includes("сравнение кругов отключено"),
        ),
      );
    },
  );
