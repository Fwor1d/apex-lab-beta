/** LMU recorder Version 1 adapter, ported from the read-only Python oracle.
 * query(sql) returns plain row objects. The caller owns read-only DuckDB access,
 * file permissions, cancellation and worker/resource limits.
 */
export const MAPPING = {
  speedMps: ["Ground Speed", "km/h", "m/s"],
  brake: ["Brake Pos", "%", "ratio"],
  throttle: ["Throttle Pos", "%", "ratio"],
  steeringNormalized: ["Steering Pos", "%", "ratio-signed"],
  distanceM: ["Lap Dist", "m", "m"],
};
export const UNITS = {
  timeS: "s",
  ...Object.fromEntries(
    Object.entries(MAPPING).map(([key, spec]) => [key, spec[2]]),
  ),
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const nullable = (value) => (finite(value) ? value : null);
const quote = (value) => '"' + String(value).replaceAll('"', '""') + '"';
const percentile = (sorted, fraction) => {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * fraction,
    lo = Math.floor(at),
    hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
};
export function seriesQuality(times, values) {
  const dt = [],
    positive = [];
  for (let i = 1; i < times.length; i++)
    if (finite(times[i]) && finite(times[i - 1])) {
      const delta = times[i] - times[i - 1];
      dt.push(delta);
      if (delta > 0) positive.push(delta);
    }
  positive.sort((a, b) => a - b);
  const median = percentile(positive, 0.5);
  return {
    samples: times.length,
    missingClock: times.reduce((n, v) => n + !finite(v), 0),
    missingValues: values.reduce((n, v) => n + !finite(v), 0),
    duplicateAdjacentTimestamps: dt.filter((v) => v === 0).length,
    reversedAdjacentTimestamps: dt.filter((v) => v < 0).length,
    medianIntervalS: median,
    observedFrequencyHz: median ? 1 / median : null,
    maxIntervalS: positive.at(-1) ?? null,
    gapsAbove3Median: median
      ? positive.filter((v) => v > 3 * median).length
      : null,
    p95IntervalS: percentile(positive, 0.95),
    unitEvidenceRequired: true,
  };
}
export function sampleAt(times, values, grid, gapS, rejectResets = false) {
  const out = new Float64Array(grid.length).fill(NaN);
  let right = 0;
  for (let i = 0; i < grid.length; i++) {
    while (right < times.length && times[right] < grid[i]) right++;
    const clipped = Math.min(right, times.length - 1);
    if (clipped < 0) continue;
    if (Math.abs(times[clipped] - grid[i]) <= 1e-7) {
      out[i] = finite(values[clipped]) ? values[clipped] : NaN;
      continue;
    }
    if (!right || right === times.length) continue;
    const lo = right - 1,
      hi = right,
      dt = times[hi] - times[lo];
    if (
      !finite(values[lo]) ||
      !finite(values[hi]) ||
      dt <= 0 ||
      dt > gapS ||
      (rejectResets && values[hi] < values[lo])
    )
      continue;
    out[i] =
      values[lo] + ((values[hi] - values[lo]) * (grid[i] - times[lo])) / dt;
  }
  return out;
}
export function eventState(events, time, fallback = null) {
  let result = fallback;
  for (const row of events) {
    if (row.ts <= time + 1e-6) result = row.value;
    else break;
  }
  return result;
}
function pitDuring(events, start, end) {
  return (
    Boolean(eventState(events, start, 0)) ||
    events.some((row) => Boolean(row.value) && start <= row.ts && row.ts < end)
  );
}
function recordingUTC(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}Z$/.test(value)
  )
    throw new Error(
      "Неподдерживаемый RecordingTime. Не угадываю часовой пояс.",
    );
  const iso = value.replaceAll("_", ":");
  const date = new Date(iso);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) + "Z" !== iso
  )
    throw new Error(
      "Неподдерживаемый RecordingTime. Не угадываю часовой пояс.",
    );
  return iso.replace("Z", "+00:00");
}
export async function importSession(
  query,
  { sha256, onProgress = () => {} } = {},
) {
  if (typeof query !== "function" || !/^[a-fA-F0-9]{64}$/.test(sha256 ?? ""))
    throw new Error("Нужны SQL-адаптер и SHA-256 выбранного исходного файла.");
  const started = performance.now();
  onProgress("Исследование таблиц и схемы");
  const tableRows = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_catalog=current_database() AND table_schema='main' AND table_type='BASE TABLE'",
  );
  const tables = new Set(tableRows.map((row) => row.table_name));
  if (tables.size > 256)
    throw new Error("Слишком много таблиц для автоматического импорта.");
  if (
    !["metadata", "channelsList", "eventsList", "Lap"].every((name) =>
      tables.has(name),
    )
  )
    throw new Error(
      "Неподдерживаемая схема: требуется исследованная структура LMU Version 1.",
    );
  const schemaRows = await query(
    "SELECT table_name,column_name,data_type,ordinal_position FROM information_schema.columns WHERE table_catalog=current_database() AND table_schema='main' ORDER BY table_name,ordinal_position",
  );
  const columns = Object.fromEntries([...tables].map((name) => [name, []]));
  const types = Object.fromEntries([...tables].map((name) => [name, {}]));
  for (const row of schemaRows)
    if (tables.has(row.table_name)) {
      columns[row.table_name].push(row.column_name);
      types[row.table_name][row.column_name] = row.data_type;
    }
  if (Object.values(columns).some((fields) => fields.length > 512))
    throw new Error("Слишком много колонок для автоматического импорта.");
  for (const [name, required] of Object.entries({
    metadata: ["key", "value"],
    channelsList: ["channelName", "frequency", "unit"],
    eventsList: ["eventName", "unit"],
  }))
    if (JSON.stringify(columns[name]) !== JSON.stringify(required))
      throw new Error(
        "Структура служебных таблиц не совпадает с исследованной версией LMU.",
      );
  // Intentionally exclude DriverName, SteamID and CarSetup from browser state/exports.
  const metadataRows = await query(
    "SELECT key,value FROM metadata WHERE key IN ('Version','RecordingTime','SessionTime','SessionType','TrackName','TrackLayout','WeatherConditions','CarName','CarClass','APEXDataKind') LIMIT 64",
  );
  const metadata = {};
  for (const row of metadataRows) {
    if (Object.hasOwn(metadata, row.key))
      throw new Error("Противоречивые метаданные: повторяющийся ключ.");
    metadata[row.key] = row.value;
  }
  if (metadata.Version !== "1" || !metadata.RecordingTime)
    throw new Error("Версия или RecordingTime LMU отсутствуют.");
  const unknownContext = [
    "TrackName",
    "TrackLayout",
    "CarName",
    "CarClass",
  ].filter((key) => typeof metadata[key] !== "string" || !metadata[key].trim());
  for (const key of unknownContext) metadata[key] = "не установлено";
  if (!metadata.SessionType) metadata.SessionType = "не установлено";
  metadata.recordingUTC = recordingUTC(metadata.RecordingTime);
  const synthetic = metadata.APEXDataKind === "synthetic",
    kind = synthetic ? "synthetic" : "telemetry-derived",
    channelStatus = synthetic ? "synthetic" : "measured";
  const session = {
    id: metadata.RecordingTime + "-" + sha256.slice(0, 12),
    metadata,
    sha256,
    inventory: [],
    events: [],
    laps: [],
    warnings: [],
    quality: {},
    schema: {
      tableCount: tables.size,
      tables: [...tables].map((name) => ({
        name,
        fields: columns[name],
        types: types[name],
      })),
    },
    timings: {},
  };
  if (unknownContext.length) {
    session.warnings.push(
      "Не установлены метаданные " +
        unknownContext.join(", ") +
        ": графики доступны, сравнение кругов отключено.",
    );
    session.comparisonAllowed = false;
  }
  const channels = await query(
    "SELECT channelName,frequency,unit FROM channelsList LIMIT 257",
  );
  if (
    channels.length > 256 ||
    new Set(channels.map((row) => row.channelName)).size !== channels.length
  )
    throw new Error("Повреждённый каталог каналов.");
  const specs = new Map(
    channels.map((row) => [row.channelName, [row.frequency, row.unit]]),
  );
  async function statsFor(name) {
    const fields = columns[name];
    if (!fields.length) throw new Error("Неподдерживаемая таблица без полей.");
    const row = (
      await query(
        "SELECT count(*) AS rows," +
          fields
            .map((field, i) => `count(*)-count(${quote(field)}) AS n${i}`)
            .join(",") +
          " FROM " +
          quote(name),
      )
    )[0];
    return {
      rows: row.rows,
      nulls: Object.fromEntries(
        fields.map((field, i) => [field, row[`n${i}`]]),
      ),
    };
  }
  onProgress("Инвентаризация каналов и событий");
  for (const { channelName: name, frequency, unit } of channels) {
    const available = tables.has(name) && !columns[name].includes("ts"),
      fields = columns[name] ?? [];
    const stats = {
      name,
      frequencyHz: frequency,
      sourceUnit: unit,
      available,
      fields,
      rows: 0,
      nulls: null,
    };
    if (available) {
      Object.assign(stats, await statsFor(name));
      const bounds = (
        await query(
          "SELECT min(rowid) AS first,max(rowid) AS last FROM " + quote(name),
        )
      )[0];
      stats.rowidDense = Boolean(
        stats.rows && bounds.first === 0 && bounds.last === stats.rows - 1,
      );
      if (JSON.stringify(fields) === '["value"]') {
        const extent = (
          await query(
            "SELECT min(value) AS minimum,max(value) AS maximum FROM " +
              quote(name),
          )
        )[0];
        stats.min = extent.minimum;
        stats.max = extent.maximum;
      }
    }
    session.inventory.push(stats);
  }
  const eventCatalog = await query(
    "SELECT eventName,unit FROM eventsList LIMIT 257",
  );
  if (
    eventCatalog.length > 256 ||
    new Set(eventCatalog.map((row) => row.eventName)).size !==
      eventCatalog.length
  )
    throw new Error("Повреждённый каталог событий.");
  const eventUnits = new Map(
      eventCatalog.map((row) => [row.eventName, row.unit]),
    ),
    eventData = new Map();
  for (const { eventName: name, unit } of eventCatalog) {
    const stats = tables.has(name)
      ? await statsFor(name)
      : { rows: 0, nulls: null };
    if (
      tables.has(name) &&
      columns[name][0] === "ts" &&
      columns[name][1] === "value"
    ) {
      const rows = await query(
        "SELECT ts,value FROM " + quote(name) + " ORDER BY ts LIMIT 100001",
      );
      if (rows.length > 100000 || rows.some((row) => !finite(row.ts)))
        throw new Error("Повреждённый timestamp события.");
      if (
        ["Lap", "Lap Time", "In Pits"].includes(name) &&
        rows.some((row, i) => i > 0 && row.ts === rows[i - 1].ts)
      )
        throw new Error(
          "Повторяющиеся timestamps ключевого события: состояние неоднозначно.",
        );
      eventData.set(name, rows);
    }
    session.events.push({
      name,
      sourceUnit: unit,
      ...stats,
      fields: columns[name] ?? [],
      available: tables.has(name),
    });
  }
  session.timings.metadataMs = performance.now() - started;
  if (
    JSON.stringify(specs.get("GPS Time")) !== '[100,"s"]' ||
    JSON.stringify(columns["GPS Time"]) !== '["value"]'
  ) {
    session.warnings.push(
      "Нет подтверждённого GPS Time 100 Гц в секундах: профили не строятся.",
    );
    return session;
  }
  const extractionStarted = performance.now();
  onProgress("Восстановление времени и нормализация сигналов");
  const clock = Float64Array.from(
    (
      await query('SELECT value FROM "GPS Time" ORDER BY rowid LIMIT 500001')
    ).map((row) => (finite(row.value) ? row.value : NaN)),
  );
  if (clock.length > 500000)
    throw new Error(
      "Запись превышает предел 500 000 отсчётов GPS Time. При 100 Гц это около 83 минут. Выберите более короткую исходную запись; файл не изменён.",
    );
  if (
    clock.length < 2 ||
    clock.some((v, i) => !finite(v) || (i > 0 && v <= clock[i - 1]))
  )
    throw new Error("Недостаточный, повреждённый или немонотонный GPS Time.");
  session.quality.clock = seriesQuality(clock, clock);
  if (!session.inventory.find((row) => row.name === "GPS Time").rowidDense)
    throw new Error(
      "GPS Time содержит разрывы rowid: восстановление сетки небезопасно.",
    );
  const aligned = {},
    channelMeta = {
      timeS: {
        unit: "s",
        status: channelStatus,
        sourceChannel: "GPS Time.value; relative to lap start",
      },
    };
  for (const [key, [name, sourceUnit, targetUnit]] of Object.entries(MAPPING)) {
    const spec = specs.get(name);
    if (
      !spec ||
      spec[1] !== sourceUnit ||
      JSON.stringify(columns[name]) !== '["value"]' ||
      !Number.isInteger(spec[0]) ||
      spec[0] <= 0 ||
      spec[0] > 100 ||
      100 % spec[0]
    ) {
      channelMeta[key] = { unit: targetUnit, status: "missing" };
      aligned[key] = new Float64Array(clock.length).fill(NaN);
      session.warnings.push(
        `${name}: отсутствует или единица/частота не подтверждена; канал оставлен пустым.`,
      );
      continue;
    }
    const frequency = spec[0],
      step = 100 / frequency,
      times = Float64Array.from(clock.filter((_, i) => i % step === 0));
    const raw = await query(
      "SELECT value FROM " +
        quote(name) +
        " ORDER BY rowid LIMIT " +
        (times.length + 1),
    );
    if (
      raw.length !== times.length ||
      !session.inventory.find((row) => row.name === name).rowidDense
    ) {
      channelMeta[key] = { unit: targetUnit, status: "missing" };
      aligned[key] = new Float64Array(clock.length).fill(NaN);
      session.warnings.push(
        `${name}: число строк не соответствует частоте; синхронизация не доказана.`,
      );
      continue;
    }
    const normalized = Float64Array.from(
      raw.map((row) => {
        if (!finite(row.value)) return NaN;
        const value =
          sourceUnit === "km/h"
            ? row.value * (1 / 3.6)
            : key === "steeringNormalized"
              ? row.value / 100
              : sourceUnit === "%"
                ? row.value * 0.01
                : row.value;
        if (
          (["brake", "throttle"].includes(key) && (value < 0 || value > 1)) ||
          (key === "steeringNormalized" && Math.abs(value) > 1) ||
          (["speedMps", "distanceM"].includes(key) && value < 0)
        )
          return NaN;
        return value;
      }),
    );
    aligned[key] = sampleAt(
      times,
      normalized,
      clock,
      Math.max(0.03, 3 / frequency),
      key === "distanceM",
    );
    channelMeta[key] = {
      unit: targetUnit,
      status: channelStatus,
      sourceChannel: name + ".value",
      sampling: {
        nativeFrequencyHz: frequency,
        method:
          "linear; rowid anchored to GPS Time; no reset/gap extrapolation",
        sourceUnit,
        timeUncertaintyS: 1 / frequency,
      },
    };
    session.quality[key] = {
      ...seriesQuality(times, normalized),
      valueOnlyTimingAssumption: true,
    };
  }
  if (aligned.distanceM.every((v) => !finite(v)))
    session.warnings.push(
      "Lap Dist недоступен: круги можно описать событиями, сравнение отключено.",
    );
  const lapEvents = eventData.get("Lap") ?? [];
  if (
    lapEvents.some(
      (row) =>
        !finite(row.value) || row.value < 0 || !Number.isInteger(row.value),
    )
  )
    throw new Error("Некорректные номера кругов в Lap.");
  if (eventUnits.get("Lap") !== "")
    throw new Error("Неизвестная единица события Lap.");
  const lapTimes =
    eventUnits.get("Lap Time") === "s" ? (eventData.get("Lap Time") ?? []) : [];
  if (!lapTimes.length)
    session.warnings.push(
      "Lap Time в секундах недоступен: валидность и лучшее время не подтверждаются.",
    );
  let pitEvents = eventData.get("In Pits") ?? [];
  if (!pitEvents.length || eventUnits.get("In Pits") !== "") {
    pitEvents = [];
    session.warnings.push(
      "Состояние In Pits недоступно: исключение пит-кругов не подтверждено.",
    );
  }
  const pitValueKnown = (value) => value === 0 || value === 1;
  if (pitEvents.some((row) => !pitValueKnown(row.value)))
    session.warnings.push(
      "In Pits содержит неизвестные значения: соответствующие круги не проходят фильтр; null не означает отсутствие пит-переезда.",
    );
  let observedExtent = null;
  for (const distance of aligned.distanceM)
    if (finite(distance))
      observedExtent = Math.max(observedExtent ?? -Infinity, distance);
  session.quality.observedDistanceExtentM = observedExtent;
  const context = {
    carId:
      unknownContext.includes("CarName") || unknownContext.includes("CarClass")
        ? "unknown-vehicle:" + session.id
        : metadata.CarName + " / " + metadata.CarClass,
    circuitId: unknownContext.includes("TrackName")
      ? "unknown-circuit:" + session.id
      : metadata.TrackName,
    layoutId: unknownContext.includes("TrackLayout")
      ? "unknown-layout:" + session.id
      : metadata.TrackLayout,
  };
  onProgress("Извлечение кругов и проверка качества");
  for (let i = 0; i < lapEvents.length; i++) {
    let start = lapEvents[i].ts;
    const number = lapEvents[i].value,
      completed = i + 1 < lapEvents.length,
      finish = completed ? lapEvents[i + 1].ts : clock.at(-1) + 0.001;
    const continuousLap = completed && lapEvents[i + 1].value === number + 1;
    const recorded = completed ? eventState(lapTimes, finish + 0.025, 0) : null;
    let startDerived = false;
    if (i === 0 && recorded > 0) {
      const candidate = finish - recorded;
      if (
        clock[0] <= candidate &&
        clock.some(
          (time, j) =>
            time >= candidate &&
            time <= candidate + 0.15 &&
            finite(aligned.distanceM[j]) &&
            aligned.distanceM[j] < 15,
        )
      ) {
        start = candidate;
        startDerived = true;
      }
    }
    const indices = [];
    for (let j = 0; j < clock.length; j++)
      if (clock[j] >= start && clock[j] < finish) indices.push(j);
    if (indices.length < 2) continue;
    if (indices.length > 200000)
      throw new Error(
        "Круг превышает лимит переносимого профиля: 200000 отсчётов.",
      );
    const times = indices.map((j) => clock[j] - start),
      arrays = Object.fromEntries(
        Object.keys(MAPPING).map((key) => [
          key,
          indices.map((j) => aligned[key][j]),
        ]),
      );
    const distances = arrays.distanceM;
    if (i > 0 || startDerived)
      for (let j = 0; j < times.length; j++)
        if (times[j] < 0.15 && distances[j] > 1000) distances[j] = NaN;
    let previous = -Infinity,
      regressions = 0;
    for (let j = 0; j < distances.length; j++)
      if (finite(distances[j])) {
        if (distances[j] < previous) {
          distances[j] = NaN;
          regressions++;
        } else previous = distances[j];
      }
    const pitStateKnown =
      pitValueKnown(eventState(pitEvents, start)) &&
      !pitEvents.some(
        (row) =>
          start <= row.ts && row.ts < finish && !pitValueKnown(row.value),
      );
    const pit = pitStateKnown ? pitDuring(pitEvents, start, finish) : null,
      distancesFinite = distances.filter(finite);
    const completeDistance = Boolean(
      observedExtent &&
      distancesFinite.length > 2 &&
      distancesFinite[0] < 20 &&
      distancesFinite.at(-1) >= 0.97 * observedExtent,
    );
    const timingAgrees = Boolean(
      recorded > 0 && Math.abs(finish - start - recorded) <= 0.04,
    );
    const eligible = Boolean(
      completed &&
      continuousLap &&
      (i > 0 || startDerived) &&
      timingAgrees &&
      completeDistance &&
      !pit &&
      pitStateKnown &&
      !unknownContext.length &&
      pitEvents.length &&
      arrays.speedMps.some(finite),
    );
    const status = eligible
      ? "время подтверждено · без пит-лейна"
      : !completed || (i === 0 && !startDerived)
        ? "неполная запись"
        : unknownContext.length
          ? "неполные метаданные / сравнение отключено"
          : !pitStateKnown
            ? "пит-состояние не установлено"
            : pit
              ? "пит / outlap"
              : !recorded
                ? "нет записанного времени · причина неизвестна"
                : "проверка покрытия/времени";
    const validation = {
      lapNumber: number,
      recordedTimeS: recorded > 0 ? recorded : null,
      boundaryDurationS: finish - start,
      completed,
      lapSequenceContinuous: continuousLap,
      eligible,
      status,
      pit,
      startDerivedFromLapTime: startDerived,
      timingAgreement: timingAgrees,
      distanceRegressions: regressions,
      distanceStartM: distancesFinite[0] ?? null,
      distanceEndM: distancesFinite.at(-1) ?? null,
      missingDistanceSamples: distances.filter((v) => !finite(v)).length,
    };
    if (!pitStateKnown) validation.pitStateKnown = false;
    if (unknownContext.length) validation.metadataComplete = false;
    const samples = times.map((timeS, j) => ({
      timeS,
      ...Object.fromEntries(
        Object.keys(MAPPING).map((key) => [key, nullable(arrays[key][j])]),
      ),
    }));
    const profile = {
      schemaVersion: "1.0.0",
      kind,
      context: { ...context },
      provenance: {
        sourceId: "lmu-recorder-v1",
        sessionId: session.id,
        lapId: String(number),
        sha256,
        distanceBasis: "LMU Lap Dist / " + metadata.TrackLayout,
      },
      channels: Object.fromEntries(
        ["timeS", ...Object.keys(MAPPING)].map((key) => [
          key,
          channelMeta[key],
        ]),
      ),
      samples,
      lapMetadata: validation,
    };
    if (synthetic)
      profile.provenance.fixtureLabel =
        "СИНТЕТИЧЕСКАЯ БАЗА · тест схемы LMU Version 1";
    session.laps.push({
      profile,
      validation,
      source_verified: !synthetic,
      certified_valid: !synthetic && eligible,
    });
  }
  session.warnings.push(
    "Отдельного ValidLap-флага нет. Фильтр проверяет положительный Lap Time, часы, покрытие и пит-состояние; спортивная валидность LMU независимо не подтверждена.",
    "Модель автомобиля не указана в metadata: CarName содержит имя записи/ливреи; Porsche или McLaren не предполагаются.",
    "Временная привязка value-only каналов восстановлена по частоте и GPS Time; потерю отдельных строк без timestamps исключить нельзя.",
    "Покрытие круга проверяется относительно наблюдаемого максимума Lap Dist в записи (порог 97%); это не официальная длина трассы.",
    "Система отсчёта координат не проверена: карта отключена.",
  );
  if (synthetic)
    session.warnings.unshift(
      "СИНТЕТИЧЕСКАЯ БАЗА. Никакие результаты не считаются реальными кругами LMU.",
    );
  session.fastest =
    session.laps
      .filter((lap) => lap.certified_valid)
      .sort(
        (a, b) => a.validation.recordedTimeS - b.validation.recordedTimeS,
      )[0] ?? null;
  session.timings.lapExtractionMs = performance.now() - extractionStarted;
  return session;
}
