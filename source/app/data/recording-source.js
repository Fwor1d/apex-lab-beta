import { prepareMeasuredAnalysis, SIGNAL_KEYS } from "./measured-analysis.js";
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
  #analysis = null;
  #importDescriptor = null;
  #analysisEpoch = 0;
  #analysisQueue = Promise.resolve();
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
      this.#importDescriptor = this.descriptor;
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
  get analysis() {
    return this.#analysis;
  }
  clearAnalysis() {
    this.#analysisEpoch++;
    this.#analysis = null;
    if (this.#importDescriptor) this.descriptor = this.#importDescriptor;
  }
  async comparePair(a, b) {
    this.clearAnalysis();
    const generation = this.#analysisEpoch,
      epoch = this.#epoch;
    const current = () =>
      generation === this.#analysisEpoch && epoch === this.#epoch;
    if (a === b || ![a, b].every((id) => this.eligibleForPair(id))) return null;
    const previous = this.#analysisQueue;
    const request = (async () => {
      await previous.catch(() => {});
      if (!current() || !this.#client) return null;
      const started = performance.now();
      const profileA = await this.#client.call("profile", { a });
      if (!current()) return null;
      const profileB = await this.#client.call("profile", { a: b });
      if (!current()) return null;
      const result = await this.#client.call("compare", { a, b });
      if (!current()) return null;
      const analysis = prepareMeasuredAnalysis(
        this.descriptor,
        a,
        b,
        profileA,
        profileB,
        result,
      );
      analysis.summary.metrics.requestMs = performance.now() - started;
      freeze(analysis.summary);
      this.#analysis = analysis;
      this.descriptor = freeze({
        ...this.#importDescriptor,
        lengthM: analysis.summary.bounds[1],
        capabilities: {
          ...this.#importDescriptor.capabilities,
          signals: true,
          analysis: true,
          playback: analysis.summary.mapping.intervals > 0,
        },
        laps: this.#importDescriptor.laps.map((l) => ({
          ...l,
          available: l.id === a || l.id === b,
        })),
        channels: this.#importDescriptor.channels.map((c) => ({
          ...c,
          displayStatus: analysis.summary.channels[c.id]
            ? Object.values(analysis.summary.channels[c.id]).every(
                (v) => v === "available",
              )
              ? "available"
              : Object.values(analysis.summary.channels[c.id]).every(
                    (v) => v === "unavailable",
                  )
                ? "unavailable"
                : "partial"
            : "unavailable",
        })),
      });
      return analysis.summary;
    })();
    this.#analysisQueue = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }
  available(id) {
    return (
      !!this.#analysis &&
      [this.#analysis.summary.pair.a, this.#analysis.summary.pair.b].includes(
        id,
      )
    );
  }
  valueAt(id, d) {
    return this.available(id)
      ? Object.fromEntries(
          SIGNAL_KEYS.filter((k) => k !== "timeS").map((k) => [
            k,
            this.#analysis.sample(id, k, d),
          ]),
        )
      : null;
  }
  datumAt(id, channel, d) {
    const value = this.available(id)
      ? this.#analysis.sample(id, channel, d)
      : null;
    const descriptor = this.descriptor.channels.find((c) => c.id === channel);
    return {
      value,
      unit: descriptor?.unit ?? null,
      kind: this.descriptor.kind,
      status: value === null ? "unavailable" : "available",
      reason:
        value === null ? "Нет валидного отсчёта на этой дистанции." : null,
      source: this.descriptor.id,
      samplingBoundS: descriptor?.samplingBoundS ?? null,
    };
  }
  timeAt(id, d) {
    return this.#analysis?.mappings[id]?.timeAt(d) ?? null;
  }
  duration(id) {
    return this.#analysis?.mappings[id]?.intervals.at(-1)?.endS ?? null;
  }
  distanceAtTime(id, t) {
    return this.#analysis?.mappings[id]?.distanceAt(t) ?? null;
  }
  playbackLimit(id, t) {
    return this.#analysis?.mappings[id]?.endAt(t) ?? null;
  }
  deltaAt(d) {
    return (
      this.#analysis?.sample(this.#analysis.summary.pair.b, "deltaS", d) ?? null
    );
  }
  positionAt() {
    return null;
  }
  samples(
    id,
    start = this.#analysis?.summary.bounds[0],
    end = this.#analysis?.summary.bounds[1],
  ) {
    if (
      !this.available(id) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start
    )
      return [];
    const c = this.#analysis.comparison,
      values = c[id === this.#analysis.summary.pair.a ? "a" : "b"];
    const samples = [];
    for (let i = 0; i < c.distanceM.length; i++)
      if (c.distanceM[i] >= start && c.distanceM[i] <= end)
        samples.push({
          distanceM: c.distanceM[i],
          ...Object.fromEntries(
            SIGNAL_KEYS.map((key) => [key, finite(values[key][i])]),
          ),
        });
    return samples;
  }
  events() {
    return [];
  }
  dispose() {
    this.clearAnalysis();
    this.#analysisQueue = Promise.resolve();
    this.#epoch++;
    this.#abort?.();
    this.#abort = null;
    // Termination is the bounded teardown, including pending requests and nested DuckDB Worker.
    // A release RPC alone cannot interrupt a blocked import.
    this.#client?.stop();
    this.#client = null;
    this.#importDescriptor = null;
    this.descriptor = emptyDescriptor();
  }
}
