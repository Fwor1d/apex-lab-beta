import { validatePortableProfile } from "../../mobile/src/profile-contract.js";
import { compare, coach, timeRegions, toPortableNumbers } from "./analysis.js";
import { buildCoaching } from "./coaching-engine.js";
export const REPORT_SCHEMA = "apex-report/1.0";
const pick = (value, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => value && Object.hasOwn(value, key))
      .map((key) => [key, value[key]]),
  );
export function cleanProfile(profile) {
  validatePortableProfile(profile);
  return {
    schemaVersion: profile.schemaVersion,
    kind: profile.kind,
    context: pick(profile.context, ["carId", "circuitId", "layoutId"]),
    provenance: pick(profile.provenance, [
      "sourceId",
      "sessionId",
      "lapId",
      "sha256",
      "fixtureLabel",
      "distanceBasis",
    ]),
    channels: Object.fromEntries(
      Object.entries(profile.channels).map(([key, channel]) => [
        key,
        {
          ...pick(channel, [
            "unit",
            "status",
            "sourceChannel",
            "method",
            "inputs",
          ]),
          ...(channel.sampling
            ? {
                sampling: pick(channel.sampling, [
                  "nativeFrequencyHz",
                  "method",
                  "sourceUnit",
                  "timeUncertaintyS",
                ]),
              }
            : {}),
        },
      ]),
    ),
    ...(profile.positionReference
      ? {
          positionReference: pick(profile.positionReference, ["crs", "origin"]),
        }
      : {}),
    lapMetadata: pick(profile.lapMetadata, [
      "lapNumber",
      "recordedTimeS",
      "boundaryDurationS",
      "completed",
      "lapSequenceContinuous",
      "eligible",
      "status",
      "pit",
      "startDerivedFromLapTime",
      "timingAgreement",
      "distanceRegressions",
      "distanceStartM",
      "distanceEndM",
      "missingDistanceSamples",
      "pitStateKnown",
      "metadataComplete",
    ]),
    samples: profile.samples,
  };
}
const REPORT_LIMIT = 32 * 1024 * 1024;
const metadataKeys = [
  "TrackName",
  "TrackLayout",
  "CarName",
  "CarClass",
  "SessionType",
  "RecordingTime",
];
function shortString(value, limit = 512) {
  if (typeof value !== "string" || value.length > limit)
    throw Error("Некорректное текстовое поле коучинга в отчёте.");
  return value;
}
function finiteOrNull(value) {
  if (value !== null && !Number.isFinite(value))
    throw Error("Некорректное численное основание коучинга.");
  return value;
}
function range(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(Number.isFinite) ||
    value[0] < 0 ||
    value[1] < value[0]
  )
    throw Error("Некорректный диапазон коучинга.");
  return [...value];
}
function numericEvidence(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 40
  )
    throw Error("Некорректные основания A/B.");
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      shortString(k, 80),
      finiteOrNull(v),
    ]),
  );
}
// Snapshot is portable evidence, never trusted executable diagnosis. Unknown/private keys are excluded.
function cleanCoaching(value) {
  if (
    !value ||
    value.schemaVersion !== "1.0.0" ||
    !Array.isArray(value.findings) ||
    value.findings.length > 256 ||
    !Array.isArray(value.sections) ||
    value.sections.length > 64
  )
    throw Error("Некорректная версия или размер расширения коучинга.");
  const findings = value.findings.map((f) => {
    if (
      !f ||
      !f.measured ||
      !Array.isArray(f.measured.signals) ||
      f.measured.signals.length > 6 ||
      !["observation", "inconclusive"].includes(f.classification)
    )
      throw Error("Некорректное наблюдение коучинга.");
    const result = Object.fromEntries(
      [
        "id",
        "category",
        "severity",
        "evidenceQuality",
        "classification",
        "diagnosticMode",
        "dataKind",
      ].map((k) => [k, shortString(f[k])]),
    );
    for (const key of ["explanation", "action", "followup"])
      result[key] = shortString(f[key], 4096);
    for (const key of ["sessionId", "lapAId", "lapBId", "trainingTopic"])
      result[key] = f[key] === null ? null : shortString(f[key]);
    return {
      ...result,
      distanceRangeM: range(f.distanceRangeM),
      measured: {
        a: numericEvidence(f.measured.a),
        b: numericEvidence(f.measured.b),
        signals: f.measured.signals.map((signal) => ({
          name: shortString(signal.name, 80),
          unit: shortString(signal.unit, 80),
        })),
      },
      timeImpactS: finiteOrNull(f.timeImpactS),
      uncertainty: {
        timingDistanceBoundM: finiteOrNull(f.uncertainty?.timingDistanceBoundM),
        calibrated: false,
      },
    };
  });
  const ids = new Set(findings.map((f) => f.id));
  if (ids.size !== findings.length)
    throw Error("Повторяющиеся наблюдения коучинга.");
  const sections = value.sections.map((section) => {
    if (
      !Array.isArray(section.findingIds) ||
      section.findingIds.length > 256 ||
      section.findingIds.some((id) => !ids.has(id))
    )
      throw Error("Некорректные связи раздела коучинга.");
    return {
      id: shortString(section.id),
      distanceRangeM: range(section.distanceRangeM),
      timeImpactS: finiteOrNull(section.timeImpactS),
      findingIds: [...section.findingIds],
      diagnosticMode: shortString(section.diagnosticMode),
    };
  });
  return { schemaVersion: "1.0.0", findings, sections };
}
function reportObject(profiles, { coaching, metadata } = {}) {
  if (
    !Array.isArray(profiles) ||
    profiles.length < 1 ||
    profiles.length > 2 ||
    profiles.reduce((n, p) => n + (p?.samples?.length ?? 0), 0) > 250000
  )
    throw Error(
      "Отчёт должен содержать 1…2 профиля и не больше 250000 отсчётов.",
    );
  if (profiles.some((p) => p?.kind === "educational"))
    throw Error("Учебная модель не является телеметрическим отчётом.");
  const result = {
    schemaVersion: REPORT_SCHEMA,
    appVersion: "0.7.0",
    notice:
      "Локальный экспорт измерений. Подлинность DuckDB и независимая спортивная валидность не подтверждаются JSON.",
    profiles: profiles.map(cleanProfile),
    ...(coaching || metadata
      ? {
          extensions: {
            ...(coaching ? { coaching: cleanCoaching(coaching) } : {}),
            ...(metadata
              ? {
                  recordingMetadata: Object.fromEntries(
                    metadataKeys
                      .filter((k) => typeof metadata[k] === "string")
                      .map((k) => [k, shortString(metadata[k])]),
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
  return result;
}
export function serializeReport(profiles, options) {
  const text = JSON.stringify(reportObject(profiles, options), null, 2);
  if (new TextEncoder().encode(text).length > REPORT_LIMIT)
    throw Error("Отчёт превышает лимит 32 МиБ.");
  return text;
}
export function createReport(profiles, options) {
  return JSON.parse(serializeReport(profiles, options));
}
export function parseReport(text) {
  if (
    typeof text !== "string" ||
    text.length > REPORT_LIMIT ||
    new TextEncoder().encode(text).length > REPORT_LIMIT
  )
    throw Error("Отчёт превышает лимит 32 МиБ.");
  let object;
  try {
    object = JSON.parse(text);
  } catch {
    throw Error(
      "Повреждённый JSON. Откройте отчёт, экспортированный APEX LAB.",
    );
  }
  if (!object || typeof object !== "object" || Array.isArray(object))
    throw Error("Отчёт должен быть JSON-объектом.");
  let coachingSnapshot = false;
  if (object.extensions?.coaching?.schemaVersion === "1.0.0") {
    cleanCoaching(object.extensions.coaching);
    coachingSnapshot = true;
  }
  const recordingMetadata = Object.fromEntries(
    metadataKeys
      .filter(
        (k) =>
          object.extensions?.recordingMetadata &&
          Object.hasOwn(object.extensions.recordingMetadata, k),
      )
      .map((k) => [k, shortString(object.extensions.recordingMetadata[k])]),
  );
  let profiles =
    object.schemaVersion === REPORT_SCHEMA ? object.profiles : [object];
  if (!Array.isArray(profiles) || !profiles.length || profiles.length > 2)
    throw Error("Отчёт должен содержать один или два профиля.");
  let count = 0;
  for (const profile of profiles) {
    validatePortableProfile(profile);
    count += profile.samples.length;
    if (profile.kind === "educational")
      throw Error("Учебная модель не является телеметрическим отчётом.");
  }
  if (count > 250000) throw Error("Отчёт содержит больше 250000 отсчётов.");
  profiles = profiles.map(cleanProfile);
  // Recorder-v1 adapter stores track/layout literals as context IDs. Reject contradictory headers.
  const context = profiles[0].context;
  if (profiles[0].provenance.sourceId === "lmu-recorder-v1") {
    for (const [key, field] of [
      ["TrackName", "circuitId"],
      ["TrackLayout", "layoutId"],
    ]) {
      if (context[field].startsWith("unknown-")) delete recordingMetadata[key];
      else if (
        recordingMetadata[key] &&
        recordingMetadata[key] !== context[field]
      )
        throw Error("Метаданные отчёта противоречат контексту профиля.");
    }
    if (
      !context.carId.startsWith("unknown-") &&
      recordingMetadata.CarName &&
      recordingMetadata.CarClass &&
      recordingMetadata.CarName !== context.carId &&
      recordingMetadata.CarClass !== "не указано отдельно" &&
      `${recordingMetadata.CarName} / ${recordingMetadata.CarClass}` !==
        context.carId
    )
      throw Error("Метаданные автомобиля противоречат контексту профиля.");
  }
  if (
    new Set(
      profiles.map((p) => p.provenance.lapId ?? p.provenance.fixtureLabel),
    ).size !== profiles.length
  )
    throw Error("Повторяющиеся идентификаторы кругов в отчёте.");
  const laps = profiles.map((profile) => ({
    profile,
    validation: {
      ...profile.lapMetadata,
      status: "JSON · исходная проверка не подтверждена",
    },
    source_verified: false,
    certified_valid: false,
    lapId: profile.provenance.lapId ?? "unknown",
    kind: profile.kind,
  }));
  if (laps.length === 2) compare(laps[0], laps[1]);
  return {
    laps,
    metadata: {
      TrackName: profiles[0].context.circuitId,
      TrackLayout: profiles[0].context.layoutId,
      CarName: profiles[0].context.carId,
      CarClass: "не указано отдельно",
      SessionType: "Экспорт JSON",
      RecordingTime: "не подтверждено JSON",
      ...recordingMetadata,
    },
    warnings: [
      "Открыт переносимый JSON. Числа заявлены источником; исходная база здесь не проверена.",
      "Модель автомобиля, спортивная валидность и интервенции помощников не выводятся из экспортированного JSON.",
    ],
    metrics: {
      reportBytes: new TextEncoder().encode(text).length,
      engineLoaded: false,
      coachingSnapshot,
    },
    quality: {},
    schema: { tableCount: null },
    inventory: [],
    events: [],
    fastest: null,
    report: true,
  };
}
export function reportComparison(session, a, b) {
  const lapA = session.laps.find((lap) => lap.lapId === a),
    lapB = session.laps.find((lap) => lap.lapId === b);
  if (!lapA || !lapB) throw Error("Круг отсутствует в отчёте.");
  if (
    a !== b &&
    [lapA, lapB].some(
      (lap) => lap.validation.pit !== false || lap.validation.eligible !== true,
    )
  )
    throw Error(
      "Пит-переезды и круги, не прошедшие исходный фильтр, нельзя сравнивать по времени.",
    );
  const start = performance.now(),
    comparison = compare(lapA, lapB);
  if (
    a === b &&
    (lapA.validation.pit !== false || lapA.validation.eligible !== true)
  ) {
    comparison.deltaS.fill(NaN);
    comparison.coverage = 0;
  }
  const findings = a === b ? [] : coach(lapA, lapB, comparison);
  const regions = a === b ? [] : timeRegions(comparison);
  const comparisonMs = performance.now() - start;
  const coachingStart = performance.now();
  // Recompute from validated profiles. Stored explanations and certainty are not trusted.
  const coaching = buildCoaching(lapA, lapB, comparison, {
    laps: session.laps,
    legacyFindings: findings,
  });
  return {
    comparison,
    findings,
    regions,
    comparisonMs,
    coaching,
    coachingMs: performance.now() - coachingStart,
    pair: [a, b],
  };
}
export { toPortableNumbers };
