export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;

export function bezier(points, t) {
  const m = 1 - t;
  const weights = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t];
  return {
    x: points.reduce((v, p, i) => v + p[0] * weights[i], 0),
    y: points.reduce((v, p, i) => v + p[1] * weights[i], 0),
  };
}

// An arc-length table prevents per-segment parameter jumps in the original prototype.
export function createGeometry(path) {
  if (path.point && path.heading) return path;
  if (path.points) return createPolyline(path.points, path.closed);
  const samples = [],
    distances = [0];
  path.forEach((segment, index) => {
    for (let i = index ? 1 : 0; i <= 100; i++)
      samples.push(bezier(segment, i / 100));
  });
  for (let i = 1; i < samples.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          samples[i].x - samples[i - 1].x,
          samples[i].y - samples[i - 1].y,
        ),
    );
  const length = distances.at(-1);
  if (!(length > 0)) throw new Error("Геометрия участка имеет нулевую длину");
  function point(progress) {
    const target = clamp(progress, 0, 1) * length;
    let low = 0,
      high = distances.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (distances[mid] < target) low = mid;
      else high = mid;
    }
    const t =
      (target - distances[low]) / (distances[high] - distances[low] || 1);
    return {
      x: lerp(samples[low].x, samples[high].x, t),
      y: lerp(samples[low].y, samples[high].y, t),
    };
  }
  function heading(progress) {
    const a = point(progress - 0.002),
      b = point(progress + 0.002);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
  return { samples, length, point, heading };
}

export function fitGeometry(
  points,
  width,
  height,
  worldPadding = 45,
  screenPadding = 24,
) {
  const minX = Math.min(...points.map((p) => p.x)) - worldPadding,
    maxX = Math.max(...points.map((p) => p.x)) + worldPadding;
  const minY = Math.min(...points.map((p) => p.y)) - worldPadding,
    maxY = Math.max(...points.map((p) => p.y)) + worldPadding;
  const scale = Math.min(
    Math.max(1, width - 2 * screenPadding) / (maxX - minX),
    Math.max(1, height - 2 * screenPadding) / (maxY - minY),
  );
  return {
    scale,
    x: width / 2 - ((minX + maxX) / 2) * scale,
    y: height / 2 - ((minY + maxY) / 2) * scale,
    bounds: { minX, maxX, minY, maxY },
  };
}

// WGS84 radii at the local origin; metres east, metres south (Canvas Y).
// A local projection preserves scale on this ~2 km site, without length calibration.
export function projectCoordinates(coordinates, origin = coordinates[0]) {
  const radians = Math.PI / 180;
  const latitude = origin[1] * radians;
  const e2 = 6.69437999014e-3,
    a = 6378137;
  const denominator = 1 - e2 * Math.sin(latitude) ** 2;
  const eastRadius = (a / Math.sqrt(denominator)) * Math.cos(latitude);
  const northRadius = (a * (1 - e2)) / denominator ** 1.5;
  return coordinates.map(([lon, lat]) => ({
    x: (lon - origin[0]) * radians * eastRadius,
    y: -(lat - origin[1]) * radians * northRadius,
  }));
}
export const angleDifference = (a, b) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function createPolyline(points, closed = false) {
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    throw new Error("Некорректные координаты трассы");
  const samples = points
    .filter(
      (p, i) =>
        !i || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-7,
    )
    .map((p) => ({ ...p }));
  if (
    closed &&
    Math.hypot(
      samples[0].x - samples.at(-1).x,
      samples[0].y - samples.at(-1).y,
    ) > 1e-7
  )
    samples.push({ ...samples[0] });
  const distances = [0];
  for (let i = 1; i < samples.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(
          samples[i].x - samples[i - 1].x,
          samples[i].y - samples[i - 1].y,
        ),
    );
  const length = distances.at(-1);
  if (!(length > 0)) throw new Error("Геометрия участка имеет нулевую длину");
  const normalize = (d) =>
    closed ? ((d % length) + length) % length : clamp(d, 0, length);
  function pointAtDistance(distance) {
    const target = normalize(distance);
    let low = 0,
      high = distances.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (distances[mid] < target) low = mid;
      else high = mid;
    }
    const t = (target - distances[low]) / (distances[high] - distances[low]);
    return {
      x: lerp(samples[low].x, samples[high].x, t),
      y: lerp(samples[low].y, samples[high].y, t),
    };
  }
  function nearest(point) {
    let best = { distance: Infinity };
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i],
        dx = b.x - a.x,
        dy = b.y - a.y;
      const t = clamp(
        ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy),
        0,
        1,
      );
      const projected = { x: a.x + t * dx, y: a.y + t * dy },
        distance = Math.hypot(point.x - projected.x, point.y - projected.y);
      if (distance < best.distance)
        best = {
          distance,
          point: projected,
          distanceAlong: lerp(distances[i - 1], distances[i], t),
        };
    }
    return best;
  }
  function headingAtDistance(distance) {
    // Smoothed 12 m chord: continuous orientation across coarse OSM vertices.
    const a = pointAtDistance(distance - 6),
      b = pointAtDistance(distance + 6);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
  return {
    samples,
    distances,
    length,
    closed,
    pointAtDistance,
    nearest,
    headingAtDistance,
    point: (p) => pointAtDistance(clamp(p, 0, 1) * length),
    heading: (p) => headingAtDistance(clamp(p, 0, 1) * length),
  };
}
export function circuitWindow(circuit, startDistance, length) {
  if (
    !Number.isFinite(startDistance) ||
    !(length > 0 && length < circuit.length)
  )
    throw new Error("Некорректная длина учебного окна");
  const point = (progress) =>
    circuit.pointAtDistance(startDistance + clamp(progress, 0, 1) * length);
  return {
    length,
    startDistance,
    point,
    heading: (progress) =>
      circuit.headingAtDistance(startDistance + clamp(progress, 0, 1) * length),
    samples: Array.from({ length: Math.ceil(length / 2) + 1 }, (_, i) =>
      point(i / Math.ceil(length / 2)),
    ),
  };
}
