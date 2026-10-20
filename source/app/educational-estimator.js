// Isolated educational model. Never LMU telemetry, lap prediction or an optimal line.
import { ROAD, createLine, sampleLine } from './line-geometry.js';

export const ESTIMATION_LIMITS = Object.freeze({
  roadWidthM: [1, 100], entrySpeedMps: [0, 140], lateralAccelerationMps2: [0.1, 50],
  brakingMps2: [0.1, 30], accelerationMps2: [0.1, 30], maxSpeedMps: [0.1, 140], exitSpeedMps: [0, 140],
});
const unavailable = reason => ({ available: false, reason, timeS: null, dataKind: 'educational' });
function assertPoints(points) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 20000) throw new RangeError('Нужно от 2 до 20 000 точек пути.');
  for (const p of points) if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) throw new RangeError('Координаты пути должны быть конечными и не превышать 1 000 000 SVG ед.');
  for (let i = 1; i < points.length; i += 1) if (Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) < 1e-8) throw new RangeError('Совпадающие или слишком близкие точки пути не поддерживаются.');
}
/** Polygonal path length in SVG units. Throws on invalid or degenerate samples. */
export function geometryMetrics(points) {
  assertPoints(points);
  let lengthSvg = 0;
  for (let i = 1; i < points.length; i += 1) lengthSvg += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return { lengthSvg, units: 'svg-unit', dataKind: 'educational', sampleCount: points.length };
}
/** Both paths use line-geometry's same deterministic 3-SVG-unit sampler. */
export function compareGeometry(handles, baseline = createLine()) {
  const edited = geometryMetrics(sampleLine(handles));
  const reference = geometryMetrics(sampleLine(baseline));
  const changeSvg = edited.lengthSvg - reference.lengthSvg;
  return { baseline: reference, edited, changeSvg, changePercent: changeSvg / reference.lengthSvg * 100 };
}
/** Three-point circumcircle curvature in 1/metres, absolute, with adjacent endpoint caps. */
export function sampleCurvature(points, metresPerSvgUnit) {
  assertPoints(points);
  if (!Number.isFinite(metresPerSvgUnit) || metresPerSvgUnit <= 0 || metresPerSvgUnit > 100) throw new RangeError('Масштаб должен быть положительным конечным числом ≤100 м/SVG ед.');
  const curvatures = Array(points.length).fill(0);
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ac = Math.hypot(c.x - a.x, c.y - a.y);
    if (ac < 1e-8) throw new RangeError('Обратный ход через совпадающие точки не поддерживается.');
    const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    curvatures[i] = 2 * cross / (ab * bc * ac * metresPerSvgUnit);
  }
  if (points.length > 2) { curvatures[0] = curvatures[1]; curvatures[curvatures.length - 1] = curvatures[curvatures.length - 2]; }
  return curvatures;
}
/** No defaults: all six essential SI parameters and an explicit exitMode are required. */
export function validateEstimationInputs(params) {
  if (!params || typeof params !== 'object') return { valid: false, reason: 'Задайте учебные допущения для расчёта времени.' };
  const names = { roadWidthM: 'Ширина дороги', entrySpeedMps: 'Скорость входа', lateralAccelerationMps2: 'Боковое ускорение', brakingMps2: 'Замедление', accelerationMps2: 'Разгон', maxSpeedMps: 'Предел скорости', exitSpeedMps: 'Скорость выхода' };
  for (const key of Object.keys(ESTIMATION_LIMITS).filter(k => k !== 'exitSpeedMps' || params.exitMode === 'fixed')) {
    const value = params[key], [min, max] = ESTIMATION_LIMITS[key];
    if (value === null || value === undefined || value === '') return { valid: false, reason: `${names[key]}: нет данных. Заполните поле.` };
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return { valid: false, reason: `${names[key]}: допустимо от ${min} до ${max} в единицах модели (м, с).` };
  }
  if (!['free', 'fixed'].includes(params.exitMode)) return { valid: false, reason: 'Выберите условие выхода: свободный или заданная скорость.' };
  if (params.entrySpeedMps > params.maxSpeedMps || (params.exitMode === 'fixed' && params.exitSpeedMps > params.maxSpeedMps)) return { valid: false, reason: 'Вход или выход выше заданного предела скорости. Измените граничное условие или предел.' };
  return { valid: true, reason: null };
}
/** Estimate one complete synthetic corner incl. entry/exit straights; SI output, no confidence interval. */
export function estimateCorner(points, params) {
  const validation = validateEstimationInputs(params);
  if (!validation.valid) return unavailable(validation.reason);
  try {
    const { lengthSvg } = geometryMetrics(points);
    const scale = params.roadWidthM / (ROAD.halfWidth * 2);
    const curvature = sampleCurvature(points, scale);
    const ds = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y) * scale);
    const caps = curvature.map(k => Math.min(params.maxSpeedMps, k > 0 ? Math.sqrt(params.lateralAccelerationMps2 / k) : params.maxSpeedMps));
    const eps = 1e-8;
    if (params.entrySpeedMps > caps[0] + eps) return unavailable('Заданный вход превышает боковой предел на начале пути. Снизьте скорость входа или измените допущения.');
    const speeds = [...caps]; speeds[0] = params.entrySpeedMps;
    for (let i = 1; i < speeds.length; i += 1) speeds[i] = Math.min(caps[i], Math.sqrt(speeds[i - 1] ** 2 + 2 * params.accelerationMps2 * ds[i - 1]));
    if (params.exitMode === 'fixed') {
      if (params.exitSpeedMps > speeds.at(-1) + eps) return unavailable('Заданная скорость выхода недостижима при этой линии, входе и пределах разгона/бокового ускорения.');
      speeds[speeds.length - 1] = params.exitSpeedMps;
    }
    for (let i = speeds.length - 2; i >= 0; i -= 1) speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[i + 1] ** 2 + 2 * params.brakingMps2 * ds[i]));
    if (speeds[0] + eps < params.entrySpeedMps) return unavailable('При заданном входе не хватает пути для торможения до ограничений поворота или выхода. Снизьте вход либо измените линию/допущения.');
    let timeS = 0;
    for (let i = 0; i < ds.length; i += 1) {
      const sum = speeds[i] + speeds[i + 1];
      if (sum <= 0) return unavailable('Нулевые скорости на обоих концах сегмента: этот шаг модели не описывает движение. Задайте ненулевое граничное условие.');
      timeS += 2 * ds[i] / sum;
    }
    if (!Number.isFinite(timeS) || timeS <= 0) return unavailable('Численный расчёт не дал положительного конечного времени.');
    return { available: true, reason: null, timeS, lengthM: lengthSvg * scale, metresPerSvgUnit: scale, speedsMps: speeds, curvaturePerM: curvature, segmentLengthsM: ds, dataKind: 'educational', units: { time: 's', length: 'm', speed: 'm/s', curvature: '1/m' } };
  } catch (error) { return unavailable(error.message); }
}
/** Same parameters, same sampler for both paths. No comparison if either path is infeasible. */
export function compareCornerEstimates(handles, params, baseline = createLine()) {
  let reference, edited;
  try { reference = estimateCorner(sampleLine(baseline), params); edited = estimateCorner(sampleLine(handles), params); }
  catch (error) { return { available: false, reason: error.message, differenceS: null, baseline: null, edited: null }; }
  return { available: reference.available && edited.available, baseline: reference, edited, differenceS: reference.available && edited.available ? edited.timeS - reference.timeS : null, reason: !reference.available ? `Линия примера: ${reference.reason}` : !edited.available ? `Ваша линия: ${edited.reason}` : null };
}
