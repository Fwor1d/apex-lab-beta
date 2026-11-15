// SYNTHETIC ONLY. Transport fixture calls the preserved native engine; no production eligibility bypass.
import { analysisFixture, duckFile } from "./analysis-source.mjs";
import { buildNativePair } from "../../engine/apps/browser-telemetry/src/native-trajectory.js";
export { duckFile };
export function trajectoryFixture({
  variant = "normal",
  nativePoints = 201,
  beforeCall,
  profileMutation = () => {},
  transform = (r) => r,
} = {}) {
  const duration = (nativePoints - 1) / 10,
    length = 2000,
    spacing = duration * 1.1 + 10;
  let raw = null;
  const f = analysisFixture({
    beforeCall,
    mutation(p, j) {
      const total = duration * (1 + j * 0.05),
        count = Math.round(total * 100);
      p.samples = Array.from({ length: count + 1 }, (_, i) => ({
        timeS: i / 100,
        distanceM: (length * i) / count,
        speedMps: length / total,
        brake: i % 100 < 30 ? 0.8 : 0,
        throttle: i % 100 < 30 ? 0 : 0.9,
        steeringNormalized: j === 1 ? null : Math.sin(i / 20) * 0.3,
      }));
      p.lapMetadata.recordedTimeS = total;
      profileMutation(p, j);
    },
    native(args, ps) {
      const source = {
        summary: { origin: [0, 60] },
        boundaries: [],
        samples: [],
      };
      const laps = ps.map((profile, j) => {
        const total = profile.lapMetadata.recordedTimeS,
          start = j * spacing,
          id = profile.provenance.lapId;
        source.boundaries.push({ value: id, ts: start });
        for (let i = 0; i <= Math.floor(total * 10); i++) {
          const t = i / 10,
            d = (length * t) / total,
            theta = d / 400;
          let point = {
            x: 400 * Math.sin(theta),
            y: 400 * (1 - Math.cos(theta)) + j * 2,
          };
          if (variant === "gap" && i === 40) point = null;
          if (variant === "jump" && i === 40) point = { x: 99999, y: 99999 };
          if (
            variant === "missing" ||
            (variant === "missing-a" && j === 0) ||
            (variant === "missing-b" && j === 1)
          )
            point = null;
          if (variant === "incompatible" && j === 1 && point) point.x += 5000;
          source.samples.push({
            timeS: start + t,
            point,
            speedMps: length / total,
          });
        }
        return {
          profile,
          validation: {
            eligible: true,
            pit: false,
            boundaryDurationS: total + 0.001,
            recordedTimeS: total,
          },
        };
      });
      raw = transform(
        buildNativePair(
          source,
          { id: "fixture-session", laps },
          args.a,
          args.b,
        ),
      );
      return raw;
    },
  });
  return {
    ...f,
    get raw() {
      return raw;
    },
  };
}
