// Explicit synthetic transport harness. It does NOT bypass the native Worker's authenticity guard.
// Native synthetic databases remain ineligible; private native E2E covers certified A/B separately.
import { RecordingSource } from "../../app/data/recording-source.js";
import { compare } from "../../engine/apps/browser-telemetry/src/analysis.js";
import { summary, duckFile } from "./session-summary.mjs";
export { duckFile };
export function profiles({ mutation = () => {} } = {}) {
  return ["1", "2", "3"].map((id, j) => {
    const units = {
      timeS: "s",
      distanceM: "m",
      speedMps: "m/s",
      brake: "ratio",
      throttle: "ratio",
      steeringNormalized: "ratio-signed",
    };
    const p = {
      schemaVersion: "1.0.0",
      kind: "synthetic",
      context: { carId: "TEST", circuitId: "TEST", layoutId: "TEST" },
      provenance: {
        sourceId: "fixture",
        sessionId: "fixture-session",
        lapId: id,
        sha256: "a".repeat(64),
        distanceBasis: "synthetic-m",
        fixtureLabel: "SYNTHETIC analytical contract fixture",
      },
      channels: Object.fromEntries(
        Object.entries(units).map(([key, unit]) => [
          key,
          {
            unit,
            status:
              key === "steeringNormalized" && j === 1 ? "missing" : "synthetic",
          },
        ]),
      ),
      samples: Array.from({ length: 1001 }, (_, i) => ({
        distanceM: i * 2,
        timeS: 20 * (1 + j * 0.05) * (i / 1000) ** 1.2,
        speedMps: 30 + 20 * Math.sin(i / 30) ** 2 + j,
        brake: i % 100 < 30 ? 0.8 : 0,
        throttle: i % 100 < 30 ? 0 : 0.9,
        steeringNormalized: j === 1 ? null : Math.sin(i / 20) * 0.3,
      })),
      lapMetadata: { recordedTimeS: 20 + j },
    };
    mutation(p, j);
    return p;
  });
}
export function analysisFixture({
  mutation,
  beforeCall = async () => {},
} = {}) {
  const ps = profiles({ mutation }),
    calls = [];
  let stopped = false;
  const metadata = summary({ kind: "synthetic" });
  metadata.laps = ps.map((p) => ({
    lapId: p.provenance.lapId,
    kind: "synthetic",
    source_verified: false,
    certified_valid: false,
    validation: {
      eligible: true,
      pit: false,
      recordedTimeS: p.lapMetadata.recordedTimeS,
      status: "СИНТЕТИЧЕСКИЙ TEST",
    },
  }));
  const client = {
    calls,
    stop() {
      stopped = true;
    },
    async call(action, args) {
      calls.push({ action, ...args });
      await beforeCall(action, args);
      if (stopped) throw Error("stopped");
      if (action === "open") return structuredClone(metadata);
      if (action === "profile")
        return structuredClone(ps.find((p) => p.provenance.lapId === args.a));
      if (action === "compare")
        return {
          comparison: compare(
            ps.find((p) => p.provenance.lapId === args.a),
            ps.find((p) => p.provenance.lapId === args.b),
          ),
          pair: [args.a, args.b],
          comparisonMs: 0,
        };
      throw Error("Unexpected test action");
    },
  };
  // Only this test subclass permits clearly labelled synthetic profiles to exercise presentation.
  class SyntheticAnalysisFixture extends RecordingSource {
    eligibleForPair(id) {
      return (
        this.descriptor.kind === "synthetic" &&
        this.descriptor.laps.some((l) => l.id === id && l.eligible)
      );
    }
  }
  return {
    source: new SyntheticAnalysisFixture({ createAnalyzer: () => client }),
    client,
    profiles: ps,
    summary: metadata,
  };
}
