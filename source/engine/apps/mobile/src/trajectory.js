import { clamp } from "./geometry.js";

export const APEX_PROGRESS = 0.61;
export const apexProgress = (settings) => (settings.apexPosition ?? 61) / 100;
// A planned path, not simulated tyre slip or an optimal racing line.
export function linePoint(progress, geometry, corner, settings) {
  const p = clamp(progress, 0, 1),
    point = geometry.point(p),
    angle = geometry.heading(p);
  const offset =
    -corner.direction *
    (settings.line * 0.2) *
    Math.exp(-Math.pow((p - apexProgress(settings)) / 0.2, 2));
  return {
    x: point.x - Math.sin(angle) * offset,
    y: point.y + Math.cos(angle) * offset,
  };
}
export function vehiclePose(progress, geometry, corner, settings) {
  const p = clamp(progress, 0, 1),
    span = 4 / geometry.length;
  const point = linePoint(p, geometry, corner, settings);
  const before = linePoint(clamp(p - span, 0, 1), geometry, corner, settings);
  const after = linePoint(clamp(p + span, 0, 1), geometry, corner, settings);
  return {
    ...point,
    heading: Math.atan2(after.y - before.y, after.x - before.x),
  };
}
