// Presentation only: one uniform camera transform shared by both native paths.
export const CAMERA_LIMITS = Object.freeze({ min: 1, max: 24, padding: 28 });
export function fitNativeBounds(bounds, width, height) {
  if (
    !bounds ||
    ![width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    return null;
  const { minX, minY, maxX, maxY } = bounds;
  const dx = maxX - minX,
    dy = maxY - minY;
  if (
    ![minX, minY, maxX, maxY, dx, dy].every(Number.isFinite) ||
    dx < 0 ||
    dy < 0 ||
    Math.max(dx, dy) <= 0
  )
    return null;
  const pad = Math.min(CAMERA_LIMITS.padding, width / 4, height / 4);
  const scale = Math.max(dx / (width - 2 * pad), dy / (height - 2 * pad));
  if (![scale * width, scale * height].every(Number.isFinite)) return null;
  return {
    cx: minX + dx / 2,
    cy: -(minY + dy / 2),
    width: scale * width,
    height: scale * height,
  };
}
export function cameraFrame(fit, camera) {
  if (!fit) return null;
  const zoom = Math.max(
    CAMERA_LIMITS.min,
    Math.min(CAMERA_LIMITS.max, camera?.zoom ?? 1),
  );
  return {
    cx:
      camera?.mode === "fit" || !Number.isFinite(camera?.cx)
        ? fit.cx
        : camera.cx,
    cy:
      camera?.mode === "fit" || !Number.isFinite(camera?.cy)
        ? fit.cy
        : camera.cy,
    width: fit.width / zoom,
    height: fit.height / zoom,
    zoom,
  };
}
export const viewBox = (frame) =>
  `${frame.cx - frame.width / 2} ${frame.cy - frame.height / 2} ${frame.width} ${frame.height}`;
