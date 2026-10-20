// Synthetic teaching geometry. Distances and offsets are SVG units, never metres.
const ENTRY_LENGTH = 320;
const RADIUS = 230;
const ARC_LENGTH = RADIUS * Math.PI / 2;
const ARC_END = ENTRY_LENGTH + ARC_LENGTH;
const TOTAL = ARC_END + 140;
const MAX_SAMPLES = 100000;

export const ROAD = Object.freeze({
  total: TOTAL,
  halfWidth: 64,
  handleLimit: 48,
  safetyMargin: 16,
  entryLength: ENTRY_LENGTH,
  arcLength: ARC_LENGTH,
  arcEnd: ARC_END,
  radius: RADIUS,
  units: 'svg-unit',
  dataKind: 'educational',
  accuracy: 'synthetic',
  provenance: 'Авторская синтетическая учебная дорога; не геометрия реальной трассы.',
});

export const HANDLE_DEFS = Object.freeze([
  { id: 'entry', label: 'Вход', minS: 50, maxS: 180, defaultS: 80, defaultN: -28 },
  { id: 'turnin', label: 'Начало поворота', minS: 200, maxS: 400, defaultS: 310, defaultN: -38 },
  { id: 'apex', label: 'Апекс', minS: 430, maxS: 610, defaultS: 520, defaultN: 40 },
  { id: 'exit', label: 'Выход', minS: 690, maxS: 810, defaultS: 770, defaultN: -24 },
].map(Object.freeze));

function freezeHandles(handles) {
  return Object.freeze(handles.map(handle => Object.freeze({ ...handle })));
}

function preset(label, changes = {}) {
  return Object.freeze({ label, handles: freezeHandles(HANDLE_DEFS.map(def => ({
    id: def.id, s: changes[def.id]?.s ?? def.defaultS, n: changes[def.id]?.n ?? def.defaultN,
  }))) });
}

export const PRESETS = Object.freeze({
  early: preset('Ранний апекс', { turnin: { s: 260 }, apex: { s: 465 } }),
  neutral: preset('Средний апекс'),
  late: preset('Поздний апекс', { turnin: { s: 365 }, apex: { s: 580 } }),
});

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name}: требуется конечное число`);
  }
  return value;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function validateLine(handles) {
  if (!Array.isArray(handles) || handles.length !== HANDLE_DEFS.length) {
    return { valid: false, reason: 'Требуются четыре учебные точки.' };
  }
  for (let i = 0; i < HANDLE_DEFS.length; i += 1) {
    const def = HANDLE_DEFS[i];
    const handle = handles[i];
    if (!handle || handle.id !== def.id) {
      return { valid: false, reason: 'Идентификаторы и порядок точек должны соответствовать дороге.', handleId: def.id };
    }
    if (!Number.isFinite(handle.s) || !Number.isFinite(handle.n)) {
      return { valid: false, reason: 'Координаты точек должны быть конечными числами.', handleId: def.id };
    }
    if (handle.s < def.minS || handle.s > def.maxS || Math.abs(handle.n) > ROAD.handleLimit) {
      return { valid: false, reason: 'Точка выходит за учебное окно или безопасный коридор.', handleId: def.id };
    }
    if (i > 0 && handles[i - 1].s >= handle.s) {
      return { valid: false, reason: 'Точки должны идти по возрастанию прогресса.', handleId: def.id };
    }
  }
  return { valid: true, reason: null, dataKind: ROAD.dataKind, units: ROAD.units };
}

function assertLine(handles) {
  const result = validateLine(handles);
  if (!result.valid) throw new RangeError(result.reason);
}

export function createLine(presetName = 'neutral') {
  if (!Object.hasOwn(PRESETS, presetName)) throw new RangeError('Неизвестный учебный пресет.');
  return freezeHandles(PRESETS[presetName].handles);
}

// The tangent and inward normal agree at both straight/arc joins (C1 centreline).
export function roadPoint(s, n = 0) {
  finite(s, 's'); finite(n, 'n');
  if (s < 0 || s > TOTAL) throw new RangeError('s находится вне учебной дороги.');
  if (s <= ENTRY_LENGTH) return { x: 110 + s, y: 430 - n };
  if (s <= ARC_END) {
    const theta = (s - ENTRY_LENGTH) / RADIUS;
    return { x: 430 + (RADIUS - n) * Math.sin(theta), y: 200 + (RADIUS - n) * Math.cos(theta) };
  }
  return { x: 660 - n, y: 200 - (s - ARC_END) };
}

export function projectToRoad(x, y) {
  finite(x, 'x'); finite(y, 'y');
  // Closest point on each analytic segment, then choose the smallest distance.
  const theta = clamp(Math.atan2(x - 430, y - 200), 0, Math.PI / 2);
  const candidates = [
    { s: clamp(x - 110, 0, ENTRY_LENGTH), nx: 0, ny: -1 },
    { s: ENTRY_LENGTH + theta * RADIUS, nx: -Math.sin(theta), ny: -Math.cos(theta) },
    { s: ARC_END + clamp(200 - y, 0, 140), nx: -1, ny: 0 },
  ];
  let closest = null;
  let minDistance = Infinity;
  for (const candidate of candidates) {
    const point = roadPoint(candidate.s);
    const dx = x - point.x; const dy = y - point.y;
    const distance = Math.hypot(dx, dy);
    if (closest === null || distance < minDistance) {
      minDistance = distance;
      closest = { s: candidate.s, n: dx * candidate.nx + dy * candidate.ny };
    }
  }
  if (!Number.isFinite(closest.n)) throw new RangeError('Проекция превышает числовой диапазон.');
  return closest;
}

export function moveHandle(handles, id, position) {
  assertLine(handles);
  const def = HANDLE_DEFS.find(item => item.id === id);
  if (!def) throw new RangeError('Неизвестная учебная точка.');
  if (!position || typeof position !== 'object') throw new TypeError('Требуются координаты s и n.');
  const s = clamp(finite(position.s, 's'), def.minS, def.maxS);
  const n = clamp(finite(position.n, 'n'), -ROAD.handleLimit, ROAD.handleLimit);
  return freezeHandles(handles.map(handle => handle.id === id ? { id, s, n } : handle));
}

function interpolator(handles) {
  assertLine(handles);
  const h = []; const delta = [];
  for (let i = 0; i < handles.length - 1; i += 1) {
    h.push(handles[i + 1].s - handles[i].s);
    delta.push((handles[i + 1].n - handles[i].n) / h[i]);
  }
  // PCHIP weighted harmonic slopes preserve each interval's scalar bounds.
  // Zero endpoint slopes join the constant extensions with continuous first derivative.
  const slopes = [0, 0, 0, 0];
  for (let i = 1; i < handles.length - 1; i += 1) {
    if (delta[i - 1] * delta[i] > 0) {
      const w1 = 2 * h[i] + h[i - 1]; const w2 = h[i] + 2 * h[i - 1];
      slopes[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }
  return s => {
    if (s <= handles[0].s) return handles[0].n;
    if (s >= handles.at(-1).s) return handles.at(-1).n;
    const i = handles.findIndex((handle, index) => index < handles.length - 1 && s <= handles[index + 1].s);
    const t = (s - handles[i].s) / h[i];
    const t2 = t * t; const t3 = t2 * t;
    const n = (2 * t3 - 3 * t2 + 1) * handles[i].n
      + (t3 - 2 * t2 + t) * h[i] * slopes[i]
      + (-2 * t3 + 3 * t2) * handles[i + 1].n
      + (t3 - t2) * h[i] * slopes[i + 1];
    // Floating-point rounding may otherwise exceed a bound by a few ulps.
    return clamp(n, Math.min(handles[i].n, handles[i + 1].n), Math.max(handles[i].n, handles[i + 1].n));
  };
}

function samplePositions(step, extra = []) {
  finite(step, 'step');
  if (step <= 0 || Math.ceil(TOTAL / step) > MAX_SAMPLES) throw new RangeError('Недопустимый шаг дискретизации.');
  const count = Math.ceil(TOTAL / step);
  return [...new Set([0, TOTAL, ENTRY_LENGTH, ARC_END, ...extra,
    ...Array.from({ length: count }, (_, i) => Math.min(TOTAL, i * step)),
  ])].sort((a, b) => a - b);
}

export function sampleLine(handles, step = 3) {
  const offset = interpolator(handles);
  return samplePositions(step, handles.map(handle => handle.s)).map(s => {
    const n = offset(s);
    return { s, n, ...roadPoint(s, n) };
  });
}

function svgPath(points) {
  return points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(' ');
}

export function linePath(handles) { return svgPath(sampleLine(handles)); }

export function roadBoundaryPath(side) {
  if (side !== 1 && side !== -1) throw new RangeError('Сторона границы должна быть +1 или -1.');
  return svgPath(samplePositions(3).map(s => roadPoint(s, side * ROAD.halfWidth)));
}
