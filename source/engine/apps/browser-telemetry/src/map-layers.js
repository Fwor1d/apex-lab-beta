import { geometryURL, validateCoordinates } from "./atlas.js";
import { projectCoordinates } from "../../mobile/src/geometry.js";
export function validateContext(object) {
  if (
    object?.type !== "FeatureCollection" ||
    object.source?.license !== "ODbL-1.0" ||
    !Array.isArray(object.features) ||
    object.features.length > 2500
  )
    throw Error("Неподдерживаемый картографический слой.");
  let count = 0;
  return object.features.map((f) => {
    const polygon = f.geometry?.type === "Polygon",
      line = f.geometry?.type === "LineString",
      role = f.properties?.role;
    if (
      (!polygon && !line) ||
      !["building", "landcover", "mapped-pavement", "mapped-pit-path"].includes(
        role,
      ) ||
      (role === "mapped-pit-path" ? !line : !polygon) ||
      (polygon && f.geometry.coordinates.length !== 1)
    )
      throw Error("Неподдерживаемый объект карты.");
    const cs = polygon ? f.geometry.coordinates[0] : f.geometry.coordinates;
    if (
      !Array.isArray(cs) ||
      cs.length < 2 ||
      cs.length > 5000 ||
      (count += cs.length) > 20000 ||
      !cs.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every(Number.isFinite) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 90,
      )
    )
      throw Error("Повреждённые координаты слоя карты.");
    if (
      polygon &&
      (cs.length < 4 || cs[0][0] !== cs.at(-1)[0] || cs[0][1] !== cs.at(-1)[1])
    )
      throw Error("Незамкнутый полигон карты.");
    return { role, polygon, coordinates: cs };
  });
}
export async function loadContextGeometry(layout, signal) {
  if (!layout?.geometry || !layout.contextGeometry) return null;
  const asset = layout.contextGeometry.asset;
  if (typeof asset !== "string" || !/^[a-z0-9-]+-context\.geojson$/.test(asset))
    throw Error("Недопустимый ресурс карты.");
  const controller = new AbortController(),
    onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const responses = await Promise.all([
      fetch(geometryURL(layout), { signal: controller.signal }),
      fetch(
        new URL(
          asset,
          new URL("../../telemetry/data/atlas/manifest.json", import.meta.url),
        ),
        { signal: controller.signal },
      ),
    ]);
    if (responses.some((r) => !r.ok))
      throw Error("Справочный слой не загружен. Контур и анализ доступны.");
    const texts = await Promise.all(responses.map((r) => r.text()));
    if (texts.some((t) => new TextEncoder().encode(t).length > 1024 * 1024))
      throw Error("Картографический ресурс превышает 1 МиБ.");
    const origin = validateCoordinates(JSON.parse(texts[0]))[0],
      features = validateContext(JSON.parse(texts[1]));
    return {
      revision: asset,
      features: features.map((f) => ({
        role: f.role,
        polygon: f.polygon,
        points: projectCoordinates(f.coordinates, origin),
      })),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
