import { AnalyzerWorker } from "../../engine/apps/browser-telemetry/src/client.js";
import { MAPPING } from "../../engine/apps/browser-telemetry/src/importer.js";

export const FILE_LIMITS = Object.freeze({
  minBytes: 12288,
  maxBytes: 256 * 1024 * 1024,
  headerTimeoutMs: 10000,
});
export const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const finite = (value) => (Number.isFinite(value) ? value : null);
const text = (value) =>
  typeof value === "string" && value.trim() && value !== "не установлено"
    ? value
    : null;
const errors = {
  NO_FILE: "Файл не выбран. Выберите локальную запись .duckdb.",
  EXTENSION:
    "Нужен исходный файл .duckdb. ZIP распакуйте заранее; JSON здесь не поддерживается.",
  SIZE: "Размер базы должен быть от 12 КиБ до 256 МиБ. Выберите другую или более короткую запись.",
  HEADER:
    "Заголовок DuckDB не найден. Выберите исходную базу, а не архив или JSON.",
  READ: "Не удалось прочитать файл. Проверьте доступ к нему и выберите запись повторно.",
  SCHEMA:
    "Структура или версия записи не поддерживается. Нужна исследованная схема LMU Version 1.",
  TIMEOUT:
    "Время ожидания истекло. Обработка остановлена; повторите импорт или выберите меньшую запись.",
  WORKER:
    "Worker не запустился или завершился с ошибкой. Повторите импорт в поддерживаемом браузере.",
  WASM: "Не удалось запустить локальный DuckDB-Wasm. Проверьте доступность файлов приложения и повторите импорт.",
  LIMIT:
    "Запись превышает допустимый объём обработки. Лимиты: 500 000 отсчётов GPS Time и 200 000 на круг.",
  CLOCK:
    "Временная база повреждена или не подтверждена. Без неё безопасно восстановить круги нельзя.",
  DATABASE:
    "База повреждена или несовместима с DuckDB. Выберите исходный файл и повторите импорт.",
  RESULT:
    "Worker вернул неполный результат. Повторите импорт; прежняя сессия освобождена.",
  CANCELLED: "Импорт отменён. Можно повторить его или выбрать другую запись.",
};
export function importError(code) {
  return Object.assign(new Error(errors[code]), { code });
}
export function publicImportError(error, stage) {
  if (Object.hasOwn(errors, error?.code))
    return { code: error.code, message: errors[error.code] };
  const message = String(error?.message ?? ""); // Never expose raw SQL/filenames/stack traces.
  let code = "DATABASE";
  if (
    error?.name === "NotReadableError" ||
    /передать выбранный файл|read.*file/i.test(message)
  )
    code = "READ";
  else if (/60 секунд|не отвечает|timeout|время ожидания/i.test(message))
    code = "TIMEOUT";
  else if (
    /Worker|SecurityError/.test(message) ||
    error?.name === "SecurityError"
  )
    code = "WORKER";
  else if (
    /Неподдерживаемая схема|Версия или RecordingTime|Неподдерживаемый RecordingTime|Структура служебных|Повреждённый каталог/i.test(
      message,
    )
  )
    code = "SCHEMA";
  else if (
    /corrupt|checksum|not a valid DuckDB|serialization version|database.*file|IO Error/i.test(
      message,
    )
  )
    code = "DATABASE";
  else if (/500\s?000|200000|предел|лимит переносимого/.test(message))
    code = "LIMIT";
  else if (/GPS Time|rowid/.test(message)) code = "CLOCK";
  else if (stage === "wasm" || /WebAssembly|wasm|fetch|module/i.test(message))
    code = "WASM";
  return { code, message: errors[code] };
}
const stages = new Map([
  ["Проверка SHA-256 по частям", ["hash", "Проверка целостности файла"]],
  [
    "Инициализация локального WebAssembly",
    ["wasm", "Запуск локального DuckDB-Wasm"],
  ],
  ["Исследование таблиц и схемы", ["schema", "Проверка структуры LMU"]],
  [
    "Инвентаризация каналов и событий",
    ["inventory", "Проверка каналов и событий"],
  ],
  [
    "Восстановление времени и нормализация сигналов",
    ["channels", "Восстановление времени и сигналов"],
  ],
  [
    "Извлечение кругов и проверка качества",
    ["laps", "Извлечение кругов и проверка качества"],
  ],
]);
const emptyDescriptor = () =>
  freeze({
    id: null,
    mode: "real",
    kind: "telemetry-derived",
    coverage: "unavailable",
    label: "Локальная запись",
    lengthM: null,
    laps: [],
    sectors: [],
    segments: [],
    channels: [],
    warnings: [],
    metadata: {},
    recording: null,
    session: null,
    capabilities: {
      import: true,
      signals: false,
      positions: false,
      geographic: false,
      yaw: false,
      playback: false,
      analysis: false,
      export: false,
    },
  });
const validationKeys = [
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
];
export function recordingDescriptor(session) {
  if (
    !text(session?.id) ||
    !/^[a-f0-9]{64}$/i.test(session?.sha256 ?? "") ||
    !Array.isArray(session.laps)
  )
    throw importError("RESULT");
  const kind =
    session.metadata?.APEXDataKind === "synthetic"
      ? "synthetic"
      : "telemetry-derived";
  const laps = session.laps.map((lap) => {
    if (typeof lap.lapId !== "string" || lap.kind !== kind || !lap.validation)
      throw importError("RESULT");
    const validation = Object.fromEntries(
      validationKeys
        .filter((k) => Object.hasOwn(lap.validation, k))
        .map((k) => [k, lap.validation[k]]),
    );
    return {
      id: lap.lapId,
      sessionId: session.id,
      label: "Круг " + lap.lapId,
      kind,
      inspectable: true,
      available: false,
      eligible: validation.eligible === true,
      source_verified: lap.source_verified === true,
      certified_valid: lap.certified_valid === true,
      status: text(validation.status),
      validation,
    };
  });
  if (new Set(laps.map((l) => l.id)).size !== laps.length)
    throw importError("RESULT");
  const fields = {
    track: "TrackName",
    layout: "TrackLayout",
    car: "CarName",
    carClass: "CarClass",
    sessionType: "SessionType",
    recordingUTC: "recordingUTC",
  };
  const metadata = Object.fromEntries(
    Object.entries(fields).map(([key, name]) => [
      key,
      text(session.metadata?.[name]),
    ]),
  );
  const channels = Object.entries({
    timeS: ["GPS Time", "s", "s"],
    ...MAPPING,
  }).map(([id, [name, , unit]]) => {
    const raw = session.inventory?.find((c) => c.name === name);
    const quality = session.quality?.[id === "timeS" ? "clock" : id];
    // Quality is produced by the existing normalization. Raw table presence alone is not normalized availability.
    const normalized =
      quality && quality.samples > quality.missingValues
        ? quality.missingValues > 0
          ? "partial"
          : "available"
        : "unavailable";
    return {
      id,
      name,
      kind,
      sourceUnit: text(raw?.sourceUnit),
      unit,
      frequencyHz: finite(raw?.frequencyHz),
      rawStatus: raw?.available && raw.rows > 0 ? "available" : "unavailable",
      normalizedStatus: normalized,
      displayStatus: "unavailable",
      value: null,
      samplingBoundS:
        quality?.valueOnlyTimingAssumption && raw.frequencyHz > 0
          ? 1 / raw.frequencyHz
          : null,
    };
  });
  return freeze({
    ...emptyDescriptor(),
    id: session.id,
    kind,
    label:
      kind === "synthetic"
        ? "Синтетическая тестовая база"
        : "Локальная запись LMU",
    coverage:
      laps.length &&
      channels.find((c) => c.id === "distanceM").normalizedStatus !==
        "unavailable"
        ? "available"
        : "partial",
    laps,
    channels,
    metadata,
    warnings: (session.warnings ?? []).filter((w) => typeof w === "string"),
    comparisonAllowed: session.comparisonAllowed !== false,
    recording: {
      id: session.sha256,
      source: "local-file",
      sha256: session.sha256,
    },
    session: { id: session.id, recordingId: session.sha256, kind },
    provenance: {
      importer: "lmu-recorder-v1",
      kind,
      source: "local-file",
      engineReleased: session.metrics?.engineReleased === true,
    },
    quality: {
      observedDistanceExtentM: finite(session.quality?.observedDistanceExtentM),
    },
  });
}

export class RecordingSource {
  descriptor = emptyDescriptor();
  #client = null;
  #epoch = 0;
  #abort = null;
  #createAnalyzer;
  constructor({
    createAnalyzer = (progress) => new AnalyzerWorker(progress),
  } = {}) {
    this.#createAnalyzer = createAnalyzer;
  }
  async open(file, onProgress = () => {}) {
    this.dispose();
    const epoch = this.#epoch;
    let stage = "validation";
    const current = () => epoch === this.#epoch;
    const interrupted = new Promise((_, reject) => {
      this.#abort = () => reject(importError("CANCELLED"));
    });
    let headerTimer;
    try {
      if (!file) throw importError("NO_FILE");
      if (
        typeof file.name !== "string" ||
        !file.name.toLowerCase().endsWith(".duckdb")
      )
        throw importError("EXTENSION");
      if (
        !Number.isFinite(file.size) ||
        file.size < FILE_LIMITS.minBytes ||
        file.size > FILE_LIMITS.maxBytes
      )
        throw importError("SIZE");
      // Only twelve bytes on the main thread; hash, SQL and normalization remain inside the original Worker.
      const header = await Promise.race([
        file
          .slice(0, 12)
          .arrayBuffer()
          .catch(() => {
            throw importError("READ");
          }),
        interrupted,
        new Promise((_, reject) => {
          headerTimer = setTimeout(
            () => reject(importError("TIMEOUT")),
            FILE_LIMITS.headerTimeoutMs,
          );
        }),
      ]);
      clearTimeout(headerTimer);
      if (!current()) return null;
      if (
        new TextDecoder().decode(new Uint8Array(header).slice(8, 12)) !== "DUCK"
      )
        throw importError("HEADER");
      this.#client = this.#createAnalyzer((message) => {
        if (!current()) return;
        const [key, label] = stages.get(message) ?? [
          "processing",
          "Обработка записи",
        ];
        stage = key;
        onProgress({
          phase: "importing",
          stage: key,
          message: label,
          fraction: null,
          error: null,
        });
      });
      onProgress({
        phase: "importing",
        stage: "worker",
        message: "Запуск Worker",
        fraction: null,
        error: null,
      });
      let request;
      try {
        request = this.#client.call("open", { file, method: "handle" });
      } catch {
        throw importError("WORKER");
      }
      const summary = await Promise.race([request, interrupted]);
      if (!current()) return null;
      this.descriptor = recordingDescriptor(summary);
      return this.descriptor;
    } catch (error) {
      if (!current()) return null;
      this.#client?.stop();
      this.#client = null;
      throw Object.assign(
        new Error(publicImportError(error, stage).message),
        publicImportError(error, stage),
      );
    } finally {
      clearTimeout(headerTimer);
      if (current()) this.#abort = null;
    }
  }
  hasLap(id) {
    return this.descriptor.laps.some((lap) => lap.id === id);
  }
  eligibleForPair(id) {
    const lap = this.descriptor.laps.find((l) => l.id === id);
    return !!(
      lap &&
      this.descriptor.comparisonAllowed &&
      lap.eligible &&
      lap.certified_valid &&
      lap.source_verified &&
      lap.kind === "telemetry-derived" &&
      lap.validation.pit === false
    );
  }
  available() {
    return false;
  }
  valueAt() {
    return null;
  }
  datumAt(lap, channel) {
    return {
      value: null,
      unit: channel === "timeS" ? "s" : (MAPPING[channel]?.[2] ?? null),
      kind: this.descriptor.kind,
      status: "unavailable",
      reason: "Сигналы подключаются на следующем этапе.",
      source: this.descriptor.id,
      samplingBoundS: null,
    };
  }
  timeAt() {
    return null;
  }
  duration() {
    return null;
  }
  distanceAtTime() {
    return null;
  }
  positionAt() {
    return null;
  }
  samples() {
    return [];
  }
  events() {
    return [];
  }
  dispose() {
    this.#epoch++;
    this.#abort?.();
    this.#abort = null;
    // Termination is the bounded teardown, including pending requests and nested DuckDB Worker.
    // A release RPC alone cannot interrupt a blocked import.
    this.#client?.stop();
    this.#client = null;
    this.descriptor = emptyDescriptor();
  }
}
