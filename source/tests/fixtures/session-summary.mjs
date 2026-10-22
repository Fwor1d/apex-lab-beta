// A hand-constructed adapter-contract fixture, never evidence of authentic LMU data.
export function summary({
  id = "fixture-session",
  kind = "telemetry-derived",
  eligible = ["1", "2"],
  missingDistance = false,
} = {}) {
  const names = [
    ["GPS Time", "s", 100],
    ["Ground Speed", "km/h", 100],
    ["Brake Pos", "%", 50],
    ["Throttle Pos", "%", 50],
    ["Lap Dist", "m", 10],
  ];
  const quality = {
    clock: { samples: 100, missingValues: 0 },
    speedMps: { samples: 100, missingValues: 0 },
    brake: { samples: 50, missingValues: 2 },
    throttle: { samples: 50, missingValues: 0 },
  };
  if (!missingDistance) quality.distanceM = { samples: 10, missingValues: 0 };
  return {
    id,
    sha256: "a".repeat(64),
    metadata: {
      APEXDataKind: kind === "synthetic" ? "synthetic" : undefined,
      TrackName: "CONTRACT TEST",
      TrackLayout: "TEST",
      CarName: "TEST CAR",
      CarClass: "TEST CLASS",
      SessionType: "Test",
      recordingUTC: "2026-01-01T00:00:00+00:00",
      DriverName: "PRIVATE SENTINEL",
      SteamID: "PRIVATE SENTINEL",
      CarSetup: "PRIVATE SENTINEL",
    },
    inventory: names.map(([name, sourceUnit, frequencyHz]) => ({
      name,
      sourceUnit,
      frequencyHz,
      available: true,
      rows: 100,
    })),
    quality,
    warnings: ["Fixture warning"],
    metrics: { engineReleased: true },
    laps: ["0", "1", "2"].map((lapId) => ({
      lapId,
      kind,
      source_verified: kind !== "synthetic",
      certified_valid: kind !== "synthetic" && eligible.includes(lapId),
      validation: {
        lapNumber: Number(lapId),
        recordedTimeS: lapId === "0" ? null : 10,
        eligible: eligible.includes(lapId),
        pit: lapId === "0",
        completed: lapId !== "0",
        status:
          lapId === "0" ? "пит / outlap" : "время подтверждено · без пит-лейна",
        timingAgreement: true,
        lapSequenceContinuous: true,
      },
    })),
  };
}
export function duckFile(name = "fixture.duckdb") {
  const bytes = new Uint8Array(12288);
  bytes.set(new TextEncoder().encode("DUCK"), 8);
  return new File([bytes], name);
}
export function analyzerHarness() {
  const clients = [];
  return {
    clients,
    createAnalyzer(progress) {
      const client = {
        progress,
        stopped: 0,
        calls: [],
        call(action, args) {
          this.calls.push({ action, args });
          return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
          });
        },
        stop() {
          this.stopped++;
        },
      };
      clients.push(client);
      return client;
    },
  };
}
