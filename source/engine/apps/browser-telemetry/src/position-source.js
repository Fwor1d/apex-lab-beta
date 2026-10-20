import {
  localProjection,
  relativeMetrics,
  assessMapping,
} from "./position-mapping.js";
import {
  loadAtlas,
  resolveLayout,
  geometryURL,
  validateCoordinates,
} from "./atlas.js";

// Version 1 only. Fixed SQL and verified catalog/counts; no input-supplied SQL.
export async function readPositions(query, session) {
  const kind =
    session.metadata?.APEXDataKind === "synthetic"
      ? "synthetic"
      : (session.laps?.[0]?.profile?.kind ?? "unknown");
  const inventory = session.inventory,
    clock = inventory.find((v) => v.name === "GPS Time");
  const spec = (n, u, f) =>
    inventory.find(
      (v) =>
        v.name === n &&
        v.sourceUnit === u &&
        v.frequencyHz === f &&
        v.rowidDense &&
        v.fields.length === 1 &&
        v.fields[0] === "value",
    );
  const required = ["GPS Latitude", "GPS Longitude", "GPS Speed", "Lap Dist"];
  if (
    !clock ||
    clock.rows > 500000 ||
    required.some(
      (n) =>
        !spec(
          n,
          n.includes("itude") ? "deg" : n === "GPS Speed" ? "m/s" : "m",
          10,
        ) ||
        spec(
          n,
          n.includes("itude") ? "deg" : n === "GPS Speed" ? "m/s" : "m",
          10,
        ).rows !== Math.ceil(clock.rows / 10),
    )
  )
    return {
      summary: {
        kind,
        status: "insufficient",
        explanation:
          "Координаты или их частота/rowid не подтверждены. Пространственные наложения недоступны.",
      },
      samples: [],
    };
  const rows = await query(
    'SELECT t.value AS timeS, a.value AS latitude, o.value AS longitude, s.value AS speedMps, d.value AS distanceM FROM "GPS Latitude" a JOIN "GPS Longitude" o ON a.rowid=o.rowid JOIN "GPS Speed" s ON a.rowid=s.rowid JOIN "Lap Dist" d ON a.rowid=d.rowid JOIN "GPS Time" t ON t.rowid=a.rowid*10 ORDER BY a.rowid LIMIT 50001',
  );
  if (rows.length > 50000)
    throw Error("Координатный анализ превышает предел 50000 наблюдений.");
  const first = rows.find(
    (r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude),
  );
  if (!first)
    return {
      summary: {
        kind,
        status: "insufficient",
        explanation: "Нет конечных координат.",
      },
      samples: [],
    };
  // Candidate relative metric, NOT a documented recorder CRS. Stable across sessions.
  const origin = [0, Math.round(first.latitude)];
  let xy;
  try {
    xy = localProjection(
      rows.map((r) => [r.longitude, r.latitude]),
      origin,
    );
  } catch {
    // Isolated missing coordinates remain explicit gaps; never coerce null to zero.
    xy = rows.map((r) => {
      try {
        return localProjection([[r.longitude, r.latitude]], origin)[0];
      } catch {
        return null;
      }
    });
    if (!xy.some(Boolean))
      return {
        summary: {
          kind,
          status: "insufficient",
          explanation:
            "Координатная плоскость неприменима; обычный анализ сигналов сохранён.",
        },
        samples: [],
      };
  }
  const samples = rows.map((r, i) => ({
    timeS: r.timeS,
    point: xy[i],
    speedMps: r.speedMps,
    distanceM: r.distanceM,
  }));
  const boundaries = await query(
    'SELECT ts,value FROM "Lap" ORDER BY ts LIMIT 100001',
  );
  return {
    samples,
    boundaries,
    summary: {
      kind,
      status: "unvalidated-coordinates",
      samples: rows.length,
      nativeFrequencyHz: 10,
      timeUncertaintyS: 0.1,
      origin,
      projection: "candidate spherical plane; R6371000m; no fitted scale",
      crsVerified: false,
      explanation:
        "Координаты записаны, но их система не подтверждена. Доступна численная проверка; реальная позиция на карте отключена.",
      ...relativeMetrics(samples),
    },
  };
}
export async function validateSessionPosition(source, session, lapId) {
  const lap = session.laps.find((l) => l.profile.provenance.lapId === lapId);
  if (!lap || lap.validation.eligible !== true)
    throw Error(
      "Для регистрации нужен полный круг по рабочему фильтру без пит-лейна.",
    );
  if (!source.samples.length) return source.summary;
  const p = lap.profile,
    eventIndex = source.boundaries.findIndex((e) => String(e.value) === lapId);
  const from = lap.validation.startDerivedFromLapTime
    ? source.boundaries[eventIndex + 1]?.ts - lap.validation.recordedTimeS
    : source.boundaries[eventIndex]?.ts;
  if (!Number.isFinite(from))
    throw Error("Начало круга в часах записи не установлено.");
  const selected = source.samples.filter(
    (s) => s.timeS >= from && s.timeS < from + lap.validation.boundaryDurationS,
  );
  const atlas = await loadAtlas(),
    match = resolveLayout(atlas, session.metadata);
  if (!match?.layout.geometry)
    return {
      status: "insufficient",
      kind: p.kind,
      overlaysAllowed: false,
      reasons: ["Нет подходящего справочного контура."],
    };
  const controller = new AbortController(),
    deadline = setTimeout(() => controller.abort(), 8000);
  let feature;
  try {
    const response = await fetch(geometryURL(match.layout), {
      signal: controller.signal,
    });
    if (!response.ok) throw Error("Справочная геометрия не загружена.");
    feature = await response.json();
  } finally {
    clearTimeout(deadline);
  }
  const reference = localProjection(validateCoordinates(feature));
  if (selected.some((s) => !s.point))
    return {
      status: "insufficient",
      kind: p.kind,
      overlaysAllowed: false,
      reasons: ["Пропуски координат: регистрация полного круга удержана."],
    };
  const result = assessMapping(
    selected.map((s) => s.point),
    reference,
    {
      distanceM: selected.map((s) => s.distanceM),
      metricRatio: relativeMetrics(selected).metricRatio,
    },
  );
  return {
    ...result,
    kind: p.kind,
    lapId: p.provenance.lapId,
    layoutId: match.layout.id,
    layoutConfirmed: match.layoutConfirmed,
    relative: relativeMetrics(selected),
    sourceGeometry: match.layout.source,
    source: source.summary,
  };
}
