/** Recorded local plane only. No OSM fit, smoothing, inferred yaw or absolute scale claim. */
import { compatible } from "./analysis.js";
export const NATIVE_POLICY = Object.freeze({
  schemaVersion: "1.0.0",
  maxPoints: 50000,
  maxGapS: 0.15,
  linkErrorM: 1.5,
  relativeLinkError: 0.25,
  maxBrokenFraction: 0.05,
  minIntegralM: 10,
  maxMetricDeviation: 0.05,
  pairMedianM: 15,
  pairP95M: 40,
});
const finite = Number.isFinite;
export function nearestTime(samples, timeS, bound = 0.051) {
  if (!finite(timeS) || !samples?.length) return null;
  let lo = 0,
    hi = samples.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (samples[m].timeS < timeS) lo = m + 1;
    else hi = m;
  }
  const a = samples[lo],
    b = samples[lo - 1];
  const p = !a
    ? b
    : !b
      ? a
      : Math.abs(a.timeS - timeS) < Math.abs(b.timeS - timeS)
        ? a
        : b;
  return Math.abs(p.timeS - timeS) <= bound ? p : null;
}
export function validateLocal(samples) {
  let pathM = 0,
    speedIntegralM = 0,
    gaps = 0,
    jumps = 0,
    stationary = 0;
  const links = new Array(samples.length).fill(false),
    reasons = [];
  if (
    samples.length < 3 ||
    samples.length > NATIVE_POLICY.maxPoints ||
    samples.some((p) => !p || !finite(p.timeS)) ||
    samples.filter((p) => [p.x, p.y].every(finite)).length < 3
  )
    return {
      available: false,
      reasons: ["Недостаточно конечных записанных координат."],
      links,
    };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i],
      dt = b.timeS - a.timeS;
    if (dt <= 0) {
      if (!reasons.includes("Непоследовательное время координат."))
        reasons.push("Непоследовательное время координат.");
      continue;
    }
    if (
      dt > NATIVE_POLICY.maxGapS ||
      ![a.x, a.y, b.x, b.y].every(finite) ||
      ![a.speedMps, b.speedMps].every((v) => finite(v) && v >= 0)
    ) {
      gaps++;
      continue;
    }
    const ds = Math.hypot(b.x - a.x, b.y - a.y),
      expected = (a.speedMps + b.speedMps) * 0.5 * dt;
    if (
      Math.abs(ds - expected) >
      NATIVE_POLICY.linkErrorM + NATIVE_POLICY.relativeLinkError * expected
    ) {
      jumps++;
      continue;
    }
    links[i] = true;
    pathM += ds;
    speedIntegralM += expected;
    if (expected < 0.02) stationary++;
  }
  const ratio =
    speedIntegralM >= NATIVE_POLICY.minIntegralM
      ? pathM / speedIntegralM
      : null;
  if (ratio === null)
    reasons.push("Недостаточно движения для проверки относительного масштаба.");
  else if (Math.abs(ratio - 1) > NATIVE_POLICY.maxMetricDeviation)
    reasons.push("Шаг координат не согласуется с интегралом GPS Speed.");
  if ((gaps + jumps) / (samples.length - 1) > NATIVE_POLICY.maxBrokenFraction)
    reasons.push("Слишком много разрывов или выбросов координат.");
  if (jumps)
    reasons.push(
      "Обнаружены координатные скачки; путь скрыт до проверки источника.",
    );
  return {
    available: !reasons.length,
    reasons,
    links,
    points: samples.length,
    pathM,
    speedIntegralM,
    metricRatio: ratio,
    gaps,
    jumps,
    stationaryIntervals: stationary,
    closureM: [
      samples[0].x,
      samples[0].y,
      samples.at(-1).x,
      samples.at(-1).y,
    ].every(finite)
      ? Math.hypot(
          samples.at(-1).x - samples[0].x,
          samples.at(-1).y - samples[0].y,
        )
      : null,
    geographicMapping: false,
    physicalScaleVerified: false,
    yawVerified: false,
    clockBoundS: 0.1,
  };
}
export function buildNativeLap(source, session, lapId) {
  const lap = session.laps.find((l) => l.profile.provenance.lapId === lapId);
  if (!lap || !source?.samples?.length)
    return {
      schemaVersion: "1.0.0",
      lapId,
      available: false,
      reasons: ["В источнике нет доступных координат."],
    };
  const events = source.boundaries.filter((e) => String(e.value) === lapId);
  if (events.length !== 1)
    return {
      schemaVersion: "1.0.0",
      lapId,
      available: false,
      reasons: ["Граница круга неоднозначна."],
    };
  const at = source.boundaries.indexOf(events[0]),
    v = lap.validation;
  const start = v.startDerivedFromLapTime
    ? source.boundaries[at + 1]?.ts - v.recordedTimeS
    : events[0].ts;
  const raw = source.samples.filter(
    (p) => p.timeS >= start && p.timeS < start + v.boundaryDurationS,
  );
  const samples = raw.map((p) => {
    const timeS = p.timeS - start,
      signal = nearestTime(lap.profile.samples, timeS, 0.011);
    return {
      x: p.point?.x ?? null,
      y: p.point?.y ?? null,
      timeS,
      speedMps: p.speedMps,
      distanceM: signal?.distanceM ?? null,
      brake: signal?.brake ?? null,
      throttle: signal?.throttle ?? null,
      steeringNormalized: signal?.steeringNormalized ?? null,
    };
  });
  const validation = validateLocal(samples);
  for (let i = 0; i < samples.length; i++)
    samples[i].accelerationMps2 =
      i && validation.links[i]
        ? (samples[i].speedMps - samples[i - 1].speedMps) /
          (samples[i].timeS - samples[i - 1].timeS)
        : null;
  return {
    schemaVersion: "1.0.0",
    lapId,
    kind: lap.profile.kind,
    frame: JSON.stringify([session.id, source.summary.origin]),
    ...validation,
    samples: validation.available ? samples : [],
    source:
      "GPS Latitude/Longitude; rowid × 10 → GPS Time; candidate R6371000/cos(origin latitude)",
    coordinateUnit: "candidate-metre",
    origin: source.summary.origin,
    limitations: [
      "Абсолютный физический масштаб и направление севера не подтверждены.",
      "Точки записаны с частотой 10 Гц; соединения прямые, разрывы не замыкаются.",
      "Это путь записи в локальной плоскости, без OSM, высоты, yaw и оптимальной линии.",
    ],
  };
}
function quantile(a, q) {
  const v = [...a].sort((a, b) => a - b),
    x = (v.length - 1) * q,
    lo = Math.floor(x);
  return v[lo] + (v[Math.ceil(x)] - v[lo]) * (x - lo);
}
export function localPair(a, b) {
  if (
    !a?.available ||
    !b?.available ||
    a.frame !== b.frame ||
    a.kind !== b.kind ||
    a.jumps ||
    b.jumps
  )
    return {
      available: false,
      reason: "Общая стабильная система координат A/B не подтверждена.",
    };
  if (a.lapId === b.lapId) return { available: true, sameLap: true };
  // Symmetric, bounded nearest recorded point distances, without per-lap registration.
  const distances = [];
  for (const [p, q] of [
    [a, b],
    [b, a],
  ]) {
    const points = p.samples.filter((v) => [v.x, v.y].every(finite)),
      targets = q.samples.filter((v) => [v.x, v.y].every(finite));
    if (points.length < 3 || targets.length < 3)
      return {
        available: false,
        reason: "Недостаточно конечных точек для A/B.",
      };
    const step = Math.max(1, Math.ceil(points.length / 256));
    for (let i = 0; i < points.length; i += step) {
      const u = points[i];
      let best = Infinity;
      for (const v of targets)
        best = Math.min(best, Math.hypot(u.x - v.x, u.y - v.y));
      distances.push(best);
    }
  }
  const medianM = quantile(distances, 0.5),
    p95M = quantile(distances, 0.95);
  const available =
    medianM <= NATIVE_POLICY.pairMedianM && p95M <= NATIVE_POLICY.pairP95M;
  return {
    available,
    medianM,
    p95M,
    method:
      "same recording/frame; symmetric NN; no fitted rotation/translation/scale",
    reason: available
      ? "Общий кадр записи и повторяемость формы проверены; различия не являются точной геодезической оценкой."
      : "Форма путей в общем кадре не согласована; A/B наложение отключено.",
  };
}
export function buildNativePair(source, session, a, b) {
  const started = performance.now(),
    pa = buildNativeLap(source, session, a),
    pb = a === b ? pa : buildNativeLap(source, session, b);
  let pair = { available: false, reason: "Контекст кругов несовместим." };
  try {
    if (
      a !== b &&
      [a, b].some((id) => {
        const v = session.laps.find(
          (l) => l.profile.provenance.lapId === id,
        )?.validation;
        return v?.eligible !== true || v?.pit !== false;
      })
    )
      throw Error("Круги не проходят рабочую проверку качества/пит-состояния.");
    compatible(
      session.laps.find((l) => l.profile.provenance.lapId === a),
      session.laps.find((l) => l.profile.provenance.lapId === b),
    );
    pair = localPair(pa, pb);
  } catch {
    /* no automatic fallback context */
  }
  return {
    schemaVersion: "1.0.0",
    a: pa,
    b: pb,
    pair,
    preparationMs: performance.now() - started,
  };
}
