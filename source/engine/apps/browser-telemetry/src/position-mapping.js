/** Bounded rigid registration. A shape fit is NEVER independent spatial proof.
 * No scale, reflection, distance stretching, fabricated yaw or elevation.
 */
export const POSITION_POLICY = Object.freeze({
  version: "1.0.0",
  maxSamples: 50000,
  maxVertices: 10000,
  fitSamples: 192,
  validationSamples: 512,
  iterations: 35,
  angleStepDeg: 15,
  maxRmsM: 5,
  maxP95M: 10,
  maxResidualM: 25,
});
const finite = Number.isFinite;
const quantile = (a, f) => {
  if (!a.length) return null;
  const i = (a.length - 1) * f,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
};
export function residualStats(values) {
  const a = values.filter(finite).sort((x, y) => x - y);
  return {
    count: a.length,
    rmsM: a.length
      ? Math.sqrt(a.reduce((n, v) => n + v * v, 0) / a.length)
      : null,
    medianM: quantile(a, 0.5),
    p95M: quantile(a, 0.95),
    maxM: a.at(-1) ?? null,
  };
}
export function localProjection(coordinates, origin = coordinates[0]) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length > POSITION_POLICY.maxSamples ||
    !Array.isArray(origin) ||
    origin.length !== 2 ||
    !origin.every(finite) ||
    Math.abs(origin[1]) >= 89
  )
    throw Error("Непригодная координатная плоскость.");
  const k = (Math.PI / 180) * 6371000,
    c = Math.cos((origin[1] * Math.PI) / 180);
  return coordinates.map((p) =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every(finite) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
      ? { x: (p[0] - origin[0]) * k * c, y: (p[1] - origin[1]) * k }
      : null,
  );
}
export function polylineIndex(points) {
  if (
    !Array.isArray(points) ||
    points.length < 3 ||
    points.length > POSITION_POLICY.maxVertices ||
    points.some((p) => !p || !finite(p.x) || !finite(p.y))
  )
    throw Error("Непригодная справочная геометрия.");
  let lengthM = 0;
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    if (len > 0) segments.push({ a, dx, dy, len, startM: lengthM });
    lengthM += len;
  }
  if (lengthM < 50 || !segments.length)
    throw Error("Контур слишком короткий для регистрации.");
  return { segments, lengthM };
}
export function nearestPoint(p, index) {
  let best = null,
    squared = Infinity;
  for (const s of index.segments) {
    const f = Math.max(
        0,
        Math.min(
          1,
          ((p.x - s.a.x) * s.dx + (p.y - s.a.y) * s.dy) / (s.len * s.len),
        ),
      ),
      x = s.a.x + f * s.dx,
      y = s.a.y + f * s.dy,
      e = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (e < squared) {
      squared = e;
      best = { x, y, distanceM: s.startM + f * s.len, residualM: Math.sqrt(e) };
    }
  }
  return best;
}
export const transformPoint = (p, t) => ({
  x: p.x * Math.cos(t.rotationRad) - p.y * Math.sin(t.rotationRad) + t.x,
  y: p.x * Math.sin(t.rotationRad) + p.y * Math.cos(t.rotationRad) + t.y,
});
function centroid(p) {
  return {
    x: p.reduce((n, v) => n + v.x, 0) / p.length,
    y: p.reduce((n, v) => n + v.y, 0) / p.length,
  };
}
function rigidPairs(source, target) {
  const a = centroid(source),
    b = centroid(target);
  let dot = 0,
    cross = 0;
  source.forEach((p, i) => {
    const x = p.x - a.x,
      y = p.y - a.y,
      u = target[i].x - b.x,
      v = target[i].y - b.y;
    dot += x * u + y * v;
    cross += x * v - y * u;
  });
  const rotationRad = Math.atan2(cross, dot),
    c = Math.cos(rotationRad),
    s = Math.sin(rotationRad);
  return {
    rotationRad,
    x: b.x - a.x * c + a.y * s,
    y: b.y - a.x * s - a.y * c,
    scale: 1,
    reflection: false,
  };
}
function bounded(points, n) {
  const step = Math.max(1, Math.ceil(points.length / n));
  return points.filter((_, i) => i % step === 0);
}
export function fitRigid(points, reference) {
  const index = polylineIndex(reference);
  if (
    !Array.isArray(points) ||
    points.length < 20 ||
    points.length > POSITION_POLICY.maxSamples ||
    points.some((p) => !p || !finite(p.x) || !finite(p.y))
  )
    throw Error("Недостаточно конечных координат для регистрации.");
  // Odd observations are excluded from fitting, reserved for holdout validation.
  const fit = bounded(
      points.filter((_, i) => i % 2 === 0),
      POSITION_POLICY.fitSamples,
    ),
    holdout = bounded(
      points.filter((_, i) => i % 2 === 1),
      POSITION_POLICY.validationSamples,
    ),
    a = centroid(fit),
    b = centroid(reference);
  let best = null;
  for (let deg = 0; deg < 360; deg += POSITION_POLICY.angleStepDeg) {
    const r = (deg * Math.PI) / 180,
      c = Math.cos(r),
      s = Math.sin(r);
    let t = {
      rotationRad: r,
      x: b.x - a.x * c + a.y * s,
      y: b.y - a.x * s - a.y * c,
      scale: 1,
      reflection: false,
    };
    for (let i = 0; i < POSITION_POLICY.iterations; i++) {
      const targets = fit.map((p) => nearestPoint(transformPoint(p, t), index)),
        next = rigidPairs(fit, targets);
      const change =
        Math.hypot(next.x - t.x, next.y - t.y) +
        Math.abs(next.rotationRad - t.rotationRad);
      t = next;
      if (change < 1e-7) break;
    }
    const rms = residualStats(
      fit.map((p) => nearestPoint(transformPoint(p, t), index).residualM),
    ).rmsM;
    if (!best || rms < best.fit.rmsM)
      best = {
        transform: t,
        fit: residualStats(
          fit.map((p) => nearestPoint(transformPoint(p, t), index).residualM),
        ),
      };
  }
  best.holdout = residualStats(
    holdout.map(
      (p) => nearestPoint(transformPoint(p, best.transform), index).residualM,
    ),
  );
  return best;
}
/** Nearest-line residuals are limited by actual driving line and source uncertainty.
 * Independent anchors are evaluated separately and never included in fitting.
 * Evidence must come from a reviewed source adapter, not imported report flags.
 */
export function assessMapping(
  points,
  reference,
  { evidence = {}, distanceM = [], metricRatio = null } = {},
) {
  const fit = fitRigid(points, reference),
    index = polylineIndex(reference),
    mapped = points.map((p) =>
      nearestPoint(transformPoint(p, fit.transform), index),
    );
  const all = residualStats(mapped.map((p) => p.residualM));
  let forward = 0,
    backward = 0,
    largestJump = 0;
  for (let i = 1; i < mapped.length; i++) {
    let d = mapped[i].distanceM - mapped[i - 1].distanceM;
    if (d > index.lengthM / 2) d -= index.lengthM;
    if (d < -index.lengthM / 2) d += index.lengthM;
    if (Math.abs(d) > index.lengthM / 8) {
      largestJump = Math.max(largestJump, Math.abs(d));
      continue;
    }
    if (d > 0.1) forward++;
    if (d < -0.1) backward++;
  }
  const directionAgreement =
    forward + backward
      ? Math.max(forward, backward) / (forward + backward)
      : null;
  const direction =
    forward > backward
      ? "with-reference-order"
      : backward > forward
        ? "against-reference-order"
        : "unknown";
  const anchors = Array.isArray(evidence.holdoutAnchors)
    ? evidence.holdoutAnchors.slice(0, 64)
    : [];
  const anchorStats = residualStats(
    anchors.map((v) =>
      v?.source &&
      v?.target &&
      [v.source.x, v.source.y, v.target.x, v.target.y].every(finite)
        ? Math.hypot(
            transformPoint(v.source, fit.transform).x - v.target.x,
            transformPoint(v.source, fit.transform).y - v.target.y,
          )
        : NaN,
    ),
  );
  const reasons = [];
  const distinctAnchors = new Set(
    anchors
      .filter(
        (v) =>
          v?.source &&
          v?.target &&
          [v.source.x, v.source.y, v.target.x, v.target.y].every(finite),
      )
      .map((v) => [v.source.x, v.source.y, v.target.x, v.target.y].join(",")),
  );
  let anchorArea = 0,
    sourceAnchorArea = 0;
  for (let i = 0; i < anchors.length; i++)
    for (let j = i + 1; j < anchors.length; j++)
      for (let k = j + 1; k < anchors.length; k++) {
        const [a, b, c] = [
          anchors[i]?.target,
          anchors[j]?.target,
          anchors[k]?.target,
        ];
        if (a && b && c && [a.x, a.y, b.x, b.y, c.x, c.y].every(finite))
          anchorArea = Math.max(
            anchorArea,
            Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) *
              0.5,
          );
        const [u, v, w] = [
          anchors[i]?.source,
          anchors[j]?.source,
          anchors[k]?.source,
        ];
        if (u && v && w && [u.x, u.y, v.x, v.y, w.x, w.y].every(finite))
          sourceAnchorArea = Math.max(
            sourceAnchorArea,
            Math.abs((v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x)) *
              0.5,
          );
      }
  if (evidence.crsVerified !== true)
    reasons.push(
      "Система координат записи не подтверждена первичным источником.",
    );
  if (evidence.layoutVerified !== true)
    reasons.push(
      "Совпадение именно этой LMU-конфигурации с геометрией не подтверждено.",
    );
  if (
    !finite(evidence.geometryUncertaintyM) ||
    evidence.geometryUncertaintyM < 0 ||
    evidence.geometryUncertaintyM > 5
  )
    reasons.push("Точность справочной геометрии неизвестна или недостаточна.");
  if (
    anchorStats.count < 3 ||
    distinctAnchors.size < 3 ||
    anchorArea < 100 ||
    sourceAnchorArea < 100 ||
    !finite(anchorStats.maxM) ||
    anchorStats.maxM > POSITION_POLICY.maxResidualM
  )
    reasons.push(
      "Нет трёх независимых контрольных ориентиров с допустимой ошибкой.",
    );
  if (
    fit.holdout.rmsM > POSITION_POLICY.maxRmsM ||
    fit.holdout.p95M > POSITION_POLICY.maxP95M ||
    fit.holdout.maxM > POSITION_POLICY.maxResidualM ||
    all.maxM > POSITION_POLICY.maxResidualM
  )
    reasons.push(
      "Остатки на отложенных координатах превышают исследовательский допуск 5/10/25 м.",
    );
  if (directionAgreement === null || directionAgreement < 0.95 || largestJump)
    reasons.push("Последовательность обхода неоднозначна.");
  if (
    !finite(metricRatio) ||
    metricRatio <= 0 ||
    Math.abs(metricRatio - 1) > 0.01
  )
    reasons.push("Относительная метрика не проверена независимо по скорости.");
  let drift = null,
    driftIntervals = 0,
    recordedCoverageM = 0;
  if (distanceM.length === points.length) {
    let geometric = 0;
    for (let i = 1; i < mapped.length; i++) {
      const ds = distanceM[i] - distanceM[i - 1];
      if (
        !finite(distanceM[i]) ||
        !finite(distanceM[i - 1]) ||
        ds <= 0 ||
        ds > 25
      )
        continue;
      let d = mapped[i].distanceM - mapped[i - 1].distanceM;
      if (d > index.lengthM / 2) d -= index.lengthM;
      if (d < -index.lengthM / 2) d += index.lengthM;
      if (Math.abs(d) > index.lengthM / 8) continue;
      geometric += direction === "against-reference-order" ? -d : d;
      recordedCoverageM += ds;
      driftIntervals++;
    }
    drift = driftIntervals ? geometric - recordedCoverageM : null;
  }
  return {
    schemaVersion: "1.0.0",
    status: reasons.length
      ? "reference-alignment-only"
      : "verified-spatial-mapping",
    transform: fit.transform,
    fit: fit.fit,
    holdout: fit.holdout,
    all,
    independentAnchors: anchorStats,
    direction,
    directionAgreement,
    largestProjectionJumpM: largestJump,
    distanceDriftM: drift,
    driftIntervals,
    recordedCoverageM,
    driftPolicy:
      "only adjacent positive Lap Dist links ≤25m; reset/gap excluded; not SF-normalized",
    firstSampleReferenceOffsetM: mapped[0].distanceM,
    startFinishOffsetM: null,
    startFinishStatus: "first coordinate is not a verified timing line",
    metricRatio,
    uncertaintyM: null,
    scalePolicy: "fixed 1; no reflection; no Lap Dist normalization",
    reasons,
    overlaysAllowed: reasons.length === 0,
    policy: POSITION_POLICY,
  };
}
export function relativeMetrics(samples) {
  let pathM = 0,
    speedIntegralM = 0,
    intervals = 0,
    missing = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i],
      dt = b.timeS - a.timeS;
    if (
      !a.point ||
      !b.point ||
      ![a.timeS, b.timeS, a.point.x, a.point.y, b.point.x, b.point.y].every(
        finite,
      ) ||
      !finite(a.speedMps) ||
      !finite(b.speedMps) ||
      a.speedMps < 0 ||
      b.speedMps < 0 ||
      dt <= 0 ||
      dt > 0.3
    ) {
      missing++;
      continue;
    }
    pathM += Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y);
    speedIntegralM += (a.speedMps + b.speedMps) * 0.5 * dt;
    intervals++;
  }
  return {
    pathM,
    speedIntegralM,
    metricRatio: speedIntegralM > 50 ? pathM / speedIntegralM : null,
    intervals,
    missingIntervals: missing,
  };
}
