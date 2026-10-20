// Versioned reference atlas. No telemetry registration or per-car analysis rules.
export const atlasURL = new URL("../data/atlas/manifest.json", import.meta.url);
let pending;
export function loadAtlas() {
  pending ??= fetch(atlasURL, { signal: AbortSignal.timeout(8000) })
    .then(async (response) => {
      if (!response.ok)
        throw Error("Каталог трасс недоступен. Анализ сохранён.");
      const atlas = await response.json();
      if (
        atlas.schemaVersion !== "1.0.0" ||
        !Array.isArray(atlas.tracks) ||
        atlas.tracks.length > 100
      )
        throw Error("Неподдерживаемая версия каталога трасс.");
      for (const track of atlas.tracks) {
        if (!Array.isArray(track.layouts) || track.layouts.length > 50)
          throw Error("Повреждённый каталог трасс.");
        for (const layout of track.layouts)
          if (layout.geometry) geometryURL(layout);
      }
      return atlas;
    })
    .catch((error) => {
      pending = null;
      throw error;
    });
  return pending;
}
const normalize = (s) =>
  typeof s === "string"
    ? s
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
export function resolveLayout(atlas, metadata) {
  const name = normalize(metadata?.TrackName),
    layout = normalize(metadata?.TrackLayout);
  if (!name || !layout) return null;
  const tracks = atlas.tracks.filter((t) =>
    t.aliases.some((a) => normalize(a) === name),
  );
  if (tracks.length !== 1) return null;
  const candidates = tracks[0].layouts.filter((l) =>
    l.aliases.some((a) => normalize(a) === layout),
  );
  if (candidates.length !== 1) return null;
  const entry = candidates[0];
  return {
    track: tracks[0],
    layout: entry,
    layoutConfirmed: !entry.legacyUnresolvedAliases?.some(
      (a) => normalize(a) === layout,
    ),
  };
}
export function geometryURL(layout) {
  const file = layout.geometry;
  if (file === "../algarve/gp-outline.geojson")
    return new URL("../data/algarve/gp-outline.geojson", import.meta.url);
  if (typeof file !== "string" || !/^[a-z0-9-]+\.geojson$/.test(file))
    throw Error("Неподдерживаемый ресурс геометрии.");
  return new URL(file, atlasURL);
}
export function validateCoordinates(feature) {
  const cs = feature.geometry?.coordinates;
  if (
    feature.geometry?.type !== "LineString" ||
    !Array.isArray(cs) ||
    cs.length < 2 ||
    cs.length > 10000 ||
    !cs.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every(Number.isFinite) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    )
  )
    throw Error("Повреждённая справочная геометрия. Анализ сохранён.");
  return cs;
}
export function referenceNote(match) {
  const { track, layout, layoutConfirmed } = match;
  return `${track.name} · ${layoutConfirmed ? layout.name : `конфигурация записи не установлена; справочный ${layout.name}`} · справочный контур. © OpenStreetMap contributors / ODbL. ${layoutConfirmed ? "Название конфигурации сопоставлено по каталогу." : "Записано только имя трассы: конкретная конфигурация НЕ установлена."} Совпадение LMU layout, стартовая линия и позиционная привязка НЕ подтверждены. Реальные машины и наложения отключены. ${layout.limitations.join(" ")}`;
}

/** Public selection never overrides the context recorded in an imported lap. */
export function selectionById(atlas, trackId, layoutId) {
  const track = atlas.tracks.find((t) => t.id === trackId);
  const layout = track?.layouts.find((l) => l.id === layoutId);
  return layout ? { track, layout, layoutConfirmed: true } : null;
}
export function capabilities(match) {
  const l = match?.layout;
  return Object.freeze({
    referenceMap: Boolean(l?.geometry),
    mappedContext: Boolean(l?.geometry && l?.contextGeometry),
    full2d: Boolean(l?.geometry),
    flat3d: Boolean(l?.geometry),
    genericLesson: Boolean(l),
    sectionExercise: Boolean(l?.geometry),
    dedicatedLessons: l?.training?.dedicatedLessons ?? [],
    turnMarkers: Boolean(l?.turnMarkers?.length),
    spatialTelemetry: l?.telemetryMapping?.status === "validated",
    elevation: l?.elevation?.status === "validated",
  });
}
export function contextLink(section, match, topic = null) {
  if (!["atlas", "mobile", "telemetry", "reports"].includes(section))
    throw Error("Unknown route");
  const url = new URL(`../../${section}/`, import.meta.url);
  if (match) {
    url.searchParams.set("track", match.track.id);
    url.searchParams.set("layout", match.layout.id);
  }
  if (topic) url.searchParams.set("topic", topic);
  return url;
}
