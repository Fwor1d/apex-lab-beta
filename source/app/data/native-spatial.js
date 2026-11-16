// Native Worker contract adapter. Coordinates and links remain authoritative and unchanged.
import {
  NATIVE_POLICY,
  nearestTime,
} from "../../engine/apps/browser-telemetry/src/native-trajectory.js";
import { lowerBound } from "./measured-analysis.js";
export const NATIVE_CURSOR_BOUND_S = 0.051;
const finite = Number.isFinite;
const coordinate = (v) => v === null || finite(v);
const fail = () => {
  throw Error("NATIVE_CONTRACT");
};
export function spatialBounds(paths) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    count = 0;
  for (const path of paths)
    for (const p of path.samples)
      if (finite(p.x) && finite(p.y)) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        count++;
      }
  if (
    count < 3 ||
    ![minX, minY, maxX, maxY, maxX - minX, maxY - minY].every(finite) ||
    Math.hypot(maxX - minX, maxY - minY) === 0
  )
    return null;
  return { minX, minY, maxX, maxY };
}
function checkLap(lap, descriptor, id) {
  if (
    !lap ||
    lap.schemaVersion !== "1.0.0" ||
    lap.lapId !== id ||
    typeof lap.available !== "boolean"
  )
    fail();
  if (!lap.available) {
    if (lap.samples?.length) fail();
    return null;
  }
  if (
    lap.kind !== descriptor.kind ||
    lap.coordinateUnit !== "candidate-metre" ||
    !Array.isArray(lap.origin) ||
    lap.origin.length !== 2 ||
    !lap.origin.every(finite) ||
    lap.frame !== JSON.stringify([descriptor.id, lap.origin]) ||
    lap.geographicMapping !== false ||
    lap.physicalScaleVerified !== false ||
    lap.yawVerified !== false ||
    lap.jumps !== 0
  )
    fail();
  if (
    !Array.isArray(lap.samples) ||
    lap.samples.length < 3 ||
    lap.samples.length > NATIVE_POLICY.maxPoints ||
    !Array.isArray(lap.links) ||
    lap.links.length !== lap.samples.length ||
    lap.links[0] !== false
  )
    fail();
  for (let i = 0; i < lap.samples.length; i++) {
    const p = lap.samples[i],
      prev = lap.samples[i - 1];
    if (
      !p ||
      !finite(p.timeS) ||
      !coordinate(p.x) ||
      !coordinate(p.y) ||
      !coordinate(p.distanceM) ||
      typeof lap.links[i] !== "boolean" ||
      (i && p.timeS <= prev.timeS)
    )
      fail();
    if (
      lap.links[i] &&
      (![p.x, p.y, prev.x, prev.y].every(finite) ||
        p.timeS - prev.timeS > NATIVE_POLICY.maxGapS)
    )
      fail();
  }
  if (!spatialBounds([lap])) fail();
  return lap;
}
// Only fixed messages emitted by the preserved engine may reach the UI.
const NATIVE_REASONS = new Set([
  "В источнике нет доступных координат.",
  "Граница круга неоднозначна.",
  "Недостаточно конечных записанных координат.",
  "Непоследовательное время координат.",
  "Недостаточно движения для проверки относительного масштаба.",
  "Шаг координат не согласуется с интегралом GPS Speed.",
  "Слишком много разрывов или выбросов координат.",
  "Обнаружены координатные скачки; путь скрыт до проверки источника.",
]);
const safeReasons = (lap) =>
  Array.isArray(lap?.reasons)
    ? [...new Set(lap.reasons.filter((r) => NATIVE_REASONS.has(r)))].slice(0, 3)
    : [];
export function prepareNativeSpatial(descriptor, analysis, result) {
  const { a, b, sessionId } = analysis.summary.pair;
  if (
    sessionId !== descriptor.id ||
    result?.schemaVersion !== "1.0.0" ||
    typeof result.pair?.available !== "boolean"
  )
    fail();
  const checked = {
    a: checkLap(result.a, descriptor, a),
    b: checkLap(result.b, descriptor, b),
  };
  if (
    result.pair.available &&
    (!checked.a || !checked.b || checked.a.frame !== checked.b.frame)
  )
    fail();
  // Never overlay incompatible frames. A remains inspectable; B-only is allowed if A has no path.
  const paths = {
    a: checked.a,
    b: result.pair.available || !checked.a ? checked.b : null,
  };
  const active = Object.values(paths).filter(Boolean),
    bounds = spatialBounds(active);
  const broken = active.reduce(
    (sum, p) => sum + p.links.slice(1).filter((v) => !v).length,
    0,
  );
  const phase = !bounds
    ? "unavailable"
    : !result.pair.available || broken > 0
      ? "partial"
      : "ready";
  const reasons = [
    ...new Set([...safeReasons(result.a), ...safeReasons(result.b)]),
  ];
  const summary = {
    phase,
    message: !bounds
      ? "Координаты пары недоступны. " +
        (reasons.join(" ") ||
          "Исходная пространственная проверка не пройдена.") +
        " Графики и воспроизведение сохранены."
      : !result.pair.available
        ? "Доступен только один путь. Наложение A/B не прошло исходную пространственную проверку. " +
          reasons.join(" ")
        : broken
          ? "Локальные траектории доступны с разрывами; отсутствующие участки не соединены."
          : "Два пути в общем локальном кадре записи.",
    pair: { sessionId, a, b },
    bounds,
    available: { a: !!paths.a, b: !!paths.b },
    individual: { a: !!checked.a, b: !!checked.b },
    reasons: { a: safeReasons(result.a), b: safeReasons(result.b) },
    pairAvailable: result.pair.available,
    unit: "candidate-metre",
    geographic: false,
    physicalScaleVerified: false,
    yaw: false,
    events: false,
    brokenLinks: broken,
    points: active.reduce((s, p) => s + p.samples.length, 0),
    samplingBoundS: NATIVE_CURSOR_BOUND_S,
    metrics: {
      preparationMs: finite(result.preparationMs) ? result.preparationMs : null,
    },
  };
  function positionAt(id, d) {
    const role = id === a ? "a" : id === b ? "b" : null,
      lap = paths[role],
      mapping = analysis.mappings[id];
    if (!lap || !mapping || !finite(d)) return null;
    const t = mapping.timeAt(d),
      samples = lap.samples;
    if (!finite(t) || t < samples[0].timeS || t > samples.at(-1).timeS)
      return null;
    const i = lowerBound(samples, t, (p) => p.timeS);
    if (samples[i]?.timeS !== t && !lap.links[i]) return null;
    const p = nearestTime(samples, t, NATIVE_CURSOR_BOUND_S);
    if (
      !p ||
      ![p.x, p.y, p.distanceM].every(finite) ||
      !mapping.connected(Math.min(d, p.distanceM), Math.max(d, p.distanceM))
    )
      return null;
    return p;
  }
  function pathData(role, range = null) {
    const lap = paths[role];
    if (!lap) return "";
    const mapping = analysis.mappings[role === "a" ? a : b];
    let out = "",
      previous = -2;
    for (let i = 0; i < lap.samples.length; i++) {
      const p = lap.samples[i];
      if (
        ![p.x, p.y].every(finite) ||
        (range &&
          (!finite(p.distanceM) ||
            p.distanceM < range[0] ||
            p.distanceM > range[1] ||
            mapping.timeAt(p.distanceM) === null))
      ) {
        previous = -2;
        continue;
      }
      const joined =
        previous === i - 1 &&
        lap.links[i] &&
        (!range ||
          mapping.connected(lap.samples[i - 1].distanceM, p.distanceM));
      out += (joined ? " L" : " M") + p.x + "," + -p.y;
      previous = i;
    }
    return out;
  }
  return { summary, paths, raw: result, positionAt, pathData };
}
