import { clamp, lerp, angleDifference } from "./geometry.js";
import { PARAMETERS, parameterBounds } from "../data/circuits.js";
import { linePoint, apexProgress } from "./trajectory.js";

export const MODEL_VERSION = "1.0.0";
export const MODEL_ASSUMPTIONS = Object.freeze({
  gravityMps2: 9.80665,
  maxBrakeMps2: 16,
  maxDriveMps2: 5,
  coastDecelerationMps2: 0.25,
  wheelbaseM: 2.507,
  steeringScaleDeg: 12,
  curvatureSpanM: 50,
  steps: 600,
});
const smooth = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export function brakingDistance(entryMps, targetMps, decelerationMps2) {
  if (
    ![entryMps, targetMps, decelerationMps2].every(Number.isFinite) ||
    entryMps < 0 ||
    targetMps < 0 ||
    decelerationMps2 <= 0
  )
    throw new Error("Некорректные значения тормозного пути");
  return Math.max(0, (entryMps ** 2 - targetMps ** 2) / (2 * decelerationMps2));
}
export function gripBudget(
  speedMps,
  curvature,
  brakeMps2,
  driveMps2,
  capacityMps2,
) {
  if (
    ![speedMps, curvature, brakeMps2, driveMps2, capacityMps2].every(
      Number.isFinite,
    ) ||
    speedMps < 0 ||
    brakeMps2 < 0 ||
    driveMps2 < 0 ||
    capacityMps2 <= 0
  )
    throw new Error("Некорректный бюджет сцепления");
  const lateral = speedMps ** 2 * Math.abs(curvature);
  const remaining = Math.sqrt(Math.max(0, capacityMps2 ** 2 - lateral ** 2));
  const brake = Math.min(brakeMps2, remaining),
    drive = Math.min(driveMps2, remaining);
  return {
    lateral,
    remaining,
    brake,
    drive,
    demand: Math.hypot(lateral, Math.max(brakeMps2, driveMps2)) / capacityMps2,
    lateralDemand: lateral / capacityMps2,
  };
}
export function brakeAt(progress, settings) {
  const p = progress * 100,
    start = settings.brakeStart;
  const end = Math.min(98, start + settings.release),
    ramp = Math.min(5, (end - start) / 4),
    plateau = Math.min(start + 12, end - ramp);
  if (p <= start || p >= end) return 0;
  if (p < start + ramp) return (settings.brakeIntensity * (p - start)) / ramp;
  if (p < plateau) return settings.brakeIntensity;
  return (
    settings.brakeIntensity * (1 - smooth((p - plateau) / (end - plateau)))
  );
}
export function throttleAt(progress, settings) {
  const p = progress * 100;
  if (p < settings.brakeStart)
    return 100 * (1 - smooth((p - settings.brakeStart + 4) / 4));
  return 100 * smooth((p - settings.gasStart) / settings.gasRamp);
}
export function validateModelSettings(corner, settings) {
  if (!corner?.path || !(corner.path.length > 0))
    throw new Error("Нет геометрии учебного окна");
  for (const param of PARAMETERS) {
    const value = settings?.[param.key],
      [min, max] = parameterBounds(corner, param);
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error(`Некорректный параметр: ${param.key}`);
  }
}
export function buildDrivingProfile(corner, settings, overrides = {}) {
  validateModelSettings(corner, settings);
  const assumptions = { ...MODEL_ASSUMPTIONS, ...overrides };
  for (const [key, value] of Object.entries(assumptions))
    if (
      !Number.isFinite(value) ||
      (key === "coastDecelerationMps2" ? value < 0 : value <= 0)
    )
      throw new Error(`Некорректное допущение: ${key}`);
  if (
    !Number.isInteger(assumptions.steps) ||
    assumptions.steps < 100 ||
    assumptions.steps > 5000
  )
    throw new Error("Некорректный шаг расчёта");
  const { steps, gravityMps2: g } = assumptions,
    length = corner.path.length;
  const apex = apexProgress(settings),
    capacity = settings.grip * g;
  const points = Array.from({ length: steps + 1 }, (_, i) =>
    linePoint(i / steps, corner.path, corner, settings),
  );
  const distances = [0];
  for (let i = 1; i <= steps; i++)
    distances.push(
      distances.at(-1) +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        ),
    );
  const heading = (p) => {
    const half = 3 / length,
      a = linePoint(clamp(p - half, 0, 1), corner.path, corner, settings),
      b = linePoint(clamp(p + half, 0, 1), corner.path, corner, settings);
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const curvatures = points.map((_, i) => {
    const p = i / steps,
      a = clamp(p - assumptions.curvatureSpanM / 2 / length, 0, 1),
      b = clamp(p + assumptions.curvatureSpanM / 2 / length, 0, 1);
    const pathDistance = lerp(
      distances[Math.floor(a * steps)],
      distances[Math.min(steps, Math.floor(a * steps) + 1)],
      (a * steps) % 1,
    );
    const pathEnd = lerp(
      distances[Math.floor(b * steps)],
      distances[Math.min(steps, Math.floor(b * steps) + 1)],
      (b * steps) % 1,
    );
    return (
      angleDifference(heading(b), heading(a)) /
      Math.max(1e-6, pathEnd - pathDistance)
    );
  });
  let speedSquared = (settings.entrySpeed / 3.6) ** 2,
    stopProgress = null;
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps,
      speedMps = Math.sqrt(Math.max(0, speedSquared));
    const brake = brakeAt(progress, settings),
      throttle = throttleAt(progress, settings);
    const requestedBrake = (brake / 100) * assumptions.maxBrakeMps2;
    const requestedDrive =
      progress < settings.brakeStart / 100
        ? 0
        : (throttle / 100) * assumptions.maxDriveMps2;
    const budget = gripBudget(
      speedMps,
      curvatures[i],
      requestedBrake,
      requestedDrive,
      capacity,
    );
    const coast =
      progress < settings.brakeStart / 100
        ? 0
        : assumptions.coastDecelerationMps2;
    const acceleration =
      stopProgress !== null ? 0 : budget.drive - budget.brake - coast;
    const angleDeg =
      (Math.atan(assumptions.wheelbaseM * curvatures[i]) * 180) / Math.PI;
    const ds =
      i < steps
        ? distances[i + 1] - distances[i]
        : distances[i] - distances[i - 1];
    samples.push({
      progress,
      brake,
      throttle,
      speed: speedMps * 3.6,
      steering: clamp(
        (angleDeg / assumptions.steeringScaleDeg) * 100,
        -100,
        100,
      ),
      steeringAngleDeg: angleDeg,
      curvature: curvatures[i],
      longitudinalG: acceleration / g,
      lateralG: budget.lateral / g,
      gripDemand: budget.demand,
      lateralDemand: budget.lateralDemand,
      effectiveBrake: (budget.brake / assumptions.maxBrakeMps2) * 100,
      effectiveThrottle: (budget.drive / assumptions.maxDriveMps2) * 100,
      absDemand: requestedBrake > budget.brake + 0.1 ? 1 : 0,
      tcDemand: requestedDrive > budget.drive + 0.1 ? 1 : 0,
      distanceScale: ds / (length / steps),
    });
    if (i < steps && stopProgress === null) {
      const next = speedSquared + 2 * acceleration * ds;
      if (next <= 0) {
        stopProgress =
          progress +
          speedSquared / Math.max(1e-9, -2 * acceleration * ds) / steps;
        speedSquared = 0;
      } else speedSquared = next;
    }
  }
  const maxCurvature = Math.max(...curvatures.map(Math.abs));
  const turnIndex = samples.findIndex(
    (s) => s.progress < apex && Math.abs(s.curvature) >= maxCurvature * 0.2,
  );
  const profile = {
    kind: "educational",
    modelVersion: MODEL_VERSION,
    assumptions,
    settings: { ...settings },
    samples,
    geometryStatus: "geographic-approximation",
    lengthM: length,
    pathLengthM: distances.at(-1),
    stopProgress,
    apexProgress: apex,
    turnInProgress: Math.max(
      0.02,
      (turnIndex < 0 ? Math.round(steps * (apex - 0.12)) : turnIndex) / steps,
    ),
  };
  const distanceAt = (p) => {
    const n = p * steps,
      i = Math.floor(n);
    return lerp(distances[i], distances[Math.min(steps, i + 1)], n - i);
  };
  profile.metrics = {
    achievedApexSpeed: sampleProfile(profile, apex).speed,
    targetApexSpeed: settings.apexSpeed,
    targetApexDemand:
      ((settings.apexSpeed / 3.6) ** 2 *
        Math.abs(sampleProfile(profile, apex).curvature)) /
      capacity,
    availableDistanceM: Math.max(
      0,
      distanceAt(apex) - distanceAt(settings.brakeStart / 100),
    ),
    minimumDistanceM: brakingDistance(
      settings.entrySpeed / 3.6,
      settings.apexSpeed / 3.6,
      Math.min(capacity, assumptions.maxBrakeMps2) +
        assumptions.coastDecelerationMps2,
    ),
    peakGripDemand: Math.max(...samples.map((s) => s.gripDemand)),
    peakLateralDemand: Math.max(...samples.map((s) => s.lateralDemand)),
    overlap: Math.max(
      0,
      Math.min(98, settings.brakeStart + settings.release) - settings.gasStart,
    ),
    exitSpeed: samples.at(-1).speed,
  };
  return profile;
}
export function sampleProfile(profile, progress) {
  if (!Number.isFinite(progress))
    throw new Error("Некорректное положение профиля");
  const p = clamp(progress, 0, 1),
    n = p * (profile.samples.length - 1),
    index = Math.floor(n);
  const a = profile.samples[index],
    b = profile.samples[Math.min(index + 1, profile.samples.length - 1)];
  const result = Object.fromEntries(
    Object.keys(a).map((key) => [
      key,
      key === "progress" ? p : lerp(a[key], b[key], n - index),
    ]),
  );
  if (profile.stopProgress !== null && p >= profile.stopProgress)
    result.speed = 0;
  return result;
}
const cache = new WeakMap();
export function getDrivingProfile(corner, settings) {
  let entries = cache.get(corner);
  if (!entries) {
    entries = new Map();
    cache.set(corner, entries);
  }
  const key = PARAMETERS.map((p) => settings[p.key]).join("/");
  if (entries.has(key)) return entries.get(key);
  const profile = buildDrivingProfile(
    corner,
    settings,
    corner.modelAssumptions ?? {},
  );
  if (entries.size >= 4) entries.delete(entries.keys().next().value);
  entries.set(key, profile);
  return profile;
}
