import { DEMO_ROAD_HALF_WIDTH } from "./road-corridor.js";

export const MARKER_LAYOUT = Object.freeze({
  hitSize: 44,
  visualSize: 26,
  enterWidth: 46,
  exitWidth: 39,
  minEnterWidth: 78,
  minExitWidth: 68,
  edgePadding: 3,
  maxOffset: 48,
});

export function projectedEvent(event, { pointAt, project, lengthM = 5000 }) {
  const source = pointAt(event.d);
  const before = pointAt((event.d - 2 + lengthM) % lengthM);
  const after = pointAt((event.d + 2) % lengthM);
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;
  const anchor = project(source);
  const edge = project({
    x: source.x - (dy / length) * DEMO_ROAD_HALF_WIDTH,
    y: source.y + (dx / length) * DEMO_ROAD_HALF_WIDTH,
  });
  const vx = edge.x - anchor.x;
  const vy = edge.y - anchor.y;
  const halfWidth = Math.hypot(vx, vy);
  const normal = { x: vx / (halfWidth || 1), y: vy / (halfWidth || 1) };
  return { event, source, anchor, normal, roadWidth: halfWidth * 2 };
}

const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function layoutEvents(
  projected,
  {
    width,
    height,
    occupied = [],
    vehicles = [],
    previous = new Set(),
    selectedId = null,
    overview = false,
    config = MARKER_LAYOUT,
  } = {},
) {
  const placed = [];
  const visible = new Set();
  const boxes = [...occupied];
  if (overview) return { placed, visible };

  // Selected event first; preserve stable distance order for all others.
  const ordered = [...projected].sort(
    (a, b) =>
      Number(b.event.uiId === selectedId) -
        Number(a.event.uiId === selectedId) ||
      a.event.d - b.event.d ||
      a.event.uiId.localeCompare(b.event.uiId),
  );

  for (const p of ordered) {
    const minimum = p.event.type === "minimum-speed";
    const wasVisible = previous.has(p.event.uiId);
    const threshold = minimum
      ? wasVisible
        ? config.minExitWidth
        : config.minEnterWidth
      : wasVisible
        ? config.exitWidth
        : config.enterWidth;
    const inset = config.visualSize / 2 + config.edgePadding;
    const availableOffset = p.roadWidth / 2 - inset;
    if (
      p.roadWidth < threshold ||
      availableOffset < 0 ||
      p.anchor.x < 0 ||
      p.anchor.x > width ||
      p.anchor.y < 0 ||
      p.anchor.y > height
    )
      continue;

    // Keep the visible disc inside the corridor. Only shift across the path, at the original distance.
    const preferred = p.event.key === "a" ? -1 : 1;
    const offset = Math.min(availableOffset, config.maxOffset);
    for (const side of [preferred, -preferred]) {
      const x = p.anchor.x + p.normal.x * offset * side;
      const y = p.anchor.y + p.normal.y * offset * side;
      const box = {
        x: x - config.hitSize / 2,
        y: y - config.hitSize / 2,
        w: config.hitSize,
        h: config.hitSize,
      };
      // The transparent hit area can overlap a car, but its visible disc cannot.
      const blockedByVehicle = vehicles.some((vehicle) => {
        const nearestX = Math.max(
          vehicle.x,
          Math.min(x, vehicle.x + vehicle.w),
        );
        const nearestY = Math.max(
          vehicle.y,
          Math.min(y, vehicle.y + vehicle.h),
        );
        return Math.hypot(x - nearestX, y - nearestY) < config.visualSize / 2;
      });
      if (
        blockedByVehicle ||
        box.x < 3 ||
        box.y < 3 ||
        box.x + box.w > width - 3 ||
        box.y + box.h > height - 3 ||
        boxes.some((b) => intersects(box, b))
      )
        continue;
      boxes.push({ x: box.x - 2, y: box.y - 2, w: box.w + 4, h: box.h + 4 });
      visible.add(p.event.uiId);
      placed.push({
        ...p,
        x,
        y,
        hitSize: config.hitSize,
        visualSize: config.visualSize,
      });
      break;
    }
  }
  return { placed, visible };
}
