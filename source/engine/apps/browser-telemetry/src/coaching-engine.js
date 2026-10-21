import { compatible, timeRegions, DEFAULT_POLICY } from "./analysis.js";

/** Additive diagnostics. Never mutates profiles, aligned comparison or legacy evidence. */
export const COACHING_SCHEMA_VERSION = "1.0.0";
// Reuse the established episode boundaries without changing legacy findings.
export { episodes as brakingEpisodes };
export const COACHING_POLICY = Object.freeze({
  version: "diagnostic-1",
  brakeOnset: 0.1,
  brakeReleased: 0.05,
  sustainedThrottle: 0.2,
  sustainedThrottleS: 0.3,
  exitHorizonM: 150,
  matchDistanceM: 80,
  onsetDifferenceM: 5,
  speedDifferenceMps: 3 / 3.6,
  peakDifference: 0.1,
  durationDifferenceS: 0.2,
  overlapS: 0.2,
  steeringStep: 0.03,
  releaseRiseTolerance: 0.02,
  minDerivativeHz: 10,
  regionWidthM: 200,
  regionDifferenceS: 0.5,
  incidentLossS: 2,
  incidentSpeedRatio: 0.5,
  incidentSteering: 0.5,
  maxSamples: 250000,
  maxFindings: 160,
  maxEpisodes: 256,
  maxLaps: 64,
  maxGridPoints: 10001,
  maxRegionWindows: 128,
});
const finite = Number.isFinite;
const profile = (lap) => lap?.profile ?? lap;
const session = (p) =>
  p.provenance?.sessionId ?? p.provenance?.sourceId ?? null;
const lapId = (p) => p.provenance?.lapId ?? null;
const available = (p, key) =>
  p.channels?.[key] && p.channels[key].status !== "missing";
const number = (p, sample, key) =>
  available(p, key) && finite(sample?.[key]) ? sample[key] : null;
const unit = {
  timeS: "s",
  distanceM: "m",
  speedMps: "m/s",
  brake: "ratio",
  throttle: "ratio",
  steeringNormalized: "ratio-signed",
};
const safePolicy = (comparison) => ({
  ...DEFAULT_POLICY,
  ...comparison?.policy,
});
function adjacent(p, i, keys, policy) {
  if (i < 1) return false;
  const a = p.samples[i - 1],
    b = p.samples[i];
  if (
    ["distanceM", "timeS", ...keys].some(
      (key) => number(p, a, key) === null || number(p, b, key) === null,
    )
  )
    return false;
  const dt = b.timeS - a.timeS,
    ds = b.distanceM - a.distanceM;
  return (
    dt > 0 &&
    dt <= policy.max_time_gap_s &&
    ds > 0 &&
    ds <= policy.max_distance_gap_m
  );
}
function uncertainty(p, index, key) {
  const times = ["distanceM", key].map(
    (name) => p.channels?.[name]?.sampling?.timeUncertaintyS,
  );
  const speed = number(p, p.samples[index], "speedMps");
  return speed !== null && speed >= 0 && times.every((v) => finite(v) && v >= 0)
    ? speed * (times[0] + times[1])
    : null;
}
function summaries(p, startM, endM, policy) {
  let minSpeedMps = null,
    minSpeedAtM = null,
    maxAbsSteering = null;
  let steeringActivity = 0,
    steeringCorrections = 0,
    steeringLinks = 0,
    lastSign = 0,
    turningPoint = null;
  for (let i = 0; i < p.samples.length; i++) {
    const s = p.samples[i],
      distance = number(p, s, "distanceM");
    if (distance === null || distance < startM || distance > endM) {
      lastSign = 0;
      turningPoint = null;
      continue;
    }
    const speed = number(p, s, "speedMps"),
      steer = number(p, s, "steeringNormalized");
    if (speed !== null && (minSpeedMps === null || speed < minSpeedMps)) {
      minSpeedMps = speed;
      minSpeedAtM = distance;
    }
    if (steer !== null)
      maxAbsSteering = Math.max(maxAbsSteering ?? 0, Math.abs(steer));
    if (
      !adjacent(p, i, ["steeringNormalized", "speedMps"], policy) ||
      p.samples[i - 1].distanceM < startM ||
      speed <= 1 ||
      p.samples[i - 1].speedMps <= 1
    ) {
      lastSign = 0;
      turningPoint = steer;
      continue;
    }
    turningPoint ??= p.samples[i - 1].steeringNormalized;
    const change = steer - turningPoint;
    steeringLinks++;
    // Accumulated significant input changes, including smooth multi-sample movement.
    if (Math.abs(change) >= COACHING_POLICY.steeringStep) {
      const sign = Math.sign(change);
      if (lastSign && sign !== lastSign) steeringCorrections++;
      lastSign = sign;
      steeringActivity += Math.abs(change);
      turningPoint = steer;
    }
  }
  return {
    minSpeedMps,
    minSpeedAtM,
    maxAbsSteering,
    steeringActivity: steeringLinks ? steeringActivity : null,
    steeringCorrections: steeringLinks ? steeringCorrections : null,
  };
}
function episodeMetrics(p, start, end, horizon, policy) {
  const s = p.samples,
    peak = { value: -Infinity, index: start };
  for (let j = start; j < end; j++)
    if (s[j].brake > peak.value) {
      peak.value = s[j].brake;
      peak.index = j;
    }
  const result = {
    startM: s[start].distanceM,
    endM: s[end].distanceM,
    horizonM: s[horizon].distanceM,
    peakBrake: peak.value,
    brakeDurationS: s[end].timeS - s[start].timeS,
    releaseDurationS: s[end].timeS - s[peak.index].timeS,
    releaseWithinRiseToleranceFraction: null,
    releaseReapplications: 0,
    pedalOverlapS: null,
    steeringOverlapS: null,
    entrySpeedMps: number(p, s[start], "speedMps"),
    recoverySpeedMps: number(p, s[horizon], "speedMps"),
    sustainedThrottleM: null,
    lowThrottleS: null,
    lowThrottleM: null,
    exitAccelerationMps2: null,
    timingDistanceBoundM: uncertainty(p, start, "brake"),
    throttleDistanceBoundM: null,
    ...summaries(p, s[start].distanceM, s[horizon].distanceM, policy),
  };
  let releaseLinks = 0,
    decreaseLinks = 0;
  const durations = { pedal: 0, steering: 0 },
    complete = { pedal: true, steering: true };
  for (let j = start + 1; j <= end; j++) {
    if (j > peak.index) {
      releaseLinks++;
      const rise = s[j].brake - s[j - 1].brake;
      if (rise <= COACHING_POLICY.releaseRiseTolerance) decreaseLinks++;
      else result.releaseReapplications++;
    }
    for (const [name, key, threshold] of [
      ["pedal", "throttle", 0.2],
      ["steering", "steeringNormalized", 0.1],
    ]) {
      if (!adjacent(p, j, ["brake", key], policy)) {
        complete[name] = false;
        continue;
      }
      if (
        s[j - 1].brake >= 0.1 &&
        s[j].brake >= 0.1 &&
        Math.abs(s[j - 1][key]) >= threshold &&
        Math.abs(s[j][key]) >= threshold
      )
        durations[name] += s[j].timeS - s[j - 1].timeS;
    }
  }
  result.releaseWithinRiseToleranceFraction = releaseLinks
    ? decreaseLinks / releaseLinks
    : null;
  result.pedalOverlapS = complete.pedal ? durations.pedal : null;
  result.steeringOverlapS = complete.steering ? durations.steering : null;
  let run = null,
    lowS = 0,
    lowM = 0,
    throttleComplete = true;
  for (let j = end; j <= horizon; j++) {
    if (
      number(p, s[j], "throttle") === null ||
      (j > end && !adjacent(p, j, ["throttle"], policy))
    ) {
      throttleComplete = false;
      run = null;
      continue;
    }
    if (s[j].throttle >= 0.2) {
      run ??= j;
      if (
        result.sustainedThrottleM === null &&
        s[j].timeS - s[run].timeS >= 0.3 - 1e-10
      ) {
        result.sustainedThrottleM = s[run].distanceM;
        result.throttleDistanceBoundM = uncertainty(p, run, "throttle");
      }
    } else run = null;
    if (j > end && s[j - 1].throttle < 0.2 && s[j].throttle < 0.2) {
      lowS += s[j].timeS - s[j - 1].timeS;
      lowM += s[j].distanceM - s[j - 1].distanceM;
    }
  }
  result.lowThrottleS = throttleComplete ? lowS : null;
  result.lowThrottleM = throttleComplete ? lowM : null;
  const hz = p.channels?.speedMps?.sampling?.nativeFrequencyHz;
  let continuousSpeed = finite(hz) && hz >= COACHING_POLICY.minDerivativeHz;
  for (let j = end + 1; j <= horizon; j++)
    if (!adjacent(p, j, ["speedMps"], policy)) continuousSpeed = false;
  const dt = s[horizon].timeS - s[end].timeS;
  if (
    continuousSpeed &&
    dt >= 0.3 &&
    number(p, s[end], "speedMps") !== null &&
    result.recoverySpeedMps !== null
  )
    result.exitAccelerationMps2 =
      (result.recoverySpeedMps - s[end].speedMps) / dt;
  return result;
}
function episodes(p, policy) {
  const results = [],
    s = p.samples;
  for (
    let i = 1;
    i < s.length && results.length < COACHING_POLICY.maxEpisodes;
    i++
  ) {
    if (
      !adjacent(p, i, ["brake"], policy) ||
      s[i - 1].brake >= 0.1 ||
      s[i].brake < 0.1
    )
      continue;
    const start = i;
    while (
      i + 1 < s.length &&
      adjacent(p, i + 1, ["brake"], policy) &&
      s[i + 1].brake >= 0.05
    )
      i++;
    if (
      i + 1 >= s.length ||
      !adjacent(p, i + 1, ["brake"], policy) ||
      s[i + 1].brake >= 0.05
    )
      continue;
    const end = ++i;
    let horizon = end;
    while (
      horizon + 1 < s.length &&
      adjacent(p, horizon + 1, ["brake"], policy) &&
      s[horizon + 1].distanceM - s[end].distanceM <= 150 &&
      s[horizon + 1].brake < 0.1
    )
      horizon++;
    results.push(episodeMetrics(p, start, end, horizon, policy));
  }
  return results;
}
const instructions = {
  "brake-onset": [
    "Сдвиг начала торможения при пороге 10%.",
    "Проверьте скорость подхода и повтор; более поздний тормоз сам по себе не означает выигрыш.",
    "braking",
  ],
  "brake-peak": [
    "Различается наблюдаемый максимум тормоза.",
    "Сравните форму педали при сопоставимых условиях; максимум не определяет оптимум.",
    "braking",
  ],
  "brake-duration": [
    "Различается длительность полного тормозного эпизода.",
    "Проверьте вход и выход вместе с графиком скорости.",
    "braking",
  ],
  "progressive-release": [
    "Различается форма отпускания тормоза после наблюдаемого пика.",
    "Сверьте плавность релиза в повторе; положение апекса и правильность trail braking не установлены.",
    "brake-release",
  ],
  "pedal-overlap": [
    "Наблюдается совместное удержание тормоза и газа.",
    "Проверьте намеренность перекрытия педалей в повторе; физическая причина не установлена.",
    "pedals",
  ],
  "steering-overlap": [
    "Различается время совместного торможения и ввода руля.",
    "Сравните вход и релиз; нормированный руль не является углом колёс.",
    "brake-release",
  ],
  "speed-minimum": [
    "Различаются наблюдаемые минимумы скорости в окне эпизода.",
    "Проверьте локальную дельту и выход; минимум не обозначает апекс.",
    null,
  ],
  "entry-speed": [
    "Различается скорость при начале торможения.",
    "Сопоставьте подход, педали и повтор без назначения идеальной скорости.",
    null,
  ],
  "recovery-speed": [
    "Различается последняя наблюдаемая скорость в ограниченном окне выхода.",
    "Проверьте доступную дистанцию выхода; окна могут иметь разные границы.",
    null,
  ],
  "sustained-throttle": [
    "Различается начало газа ≥20%, удержанного не менее 0,3 с.",
    "Проверьте ускорение и руль на выходе; ранний газ не доказывает лучшее сцепление.",
    "throttle",
  ],
  "low-throttle": [
    "Различается время и дистанция с газом ниже 20% после релиза.",
    "Сверьте повтор и условия до изменения педали.",
    "throttle",
  ],
  "exit-acceleration": [
    "Различается среднее наблюдаемое изменение скорости на выходе.",
    "Проверьте границы окна и условия; производная скорости не измеряет запас сцепления.",
    null,
  ],
  "steering-activity": [
    "Различается сумма изменений нормированного руля и число значимых смен направления ввода.",
    "Посмотрите повтор и плавность управления; снос, занос и потеря контроля не доказаны.",
    "steering",
  ],
};

/** @returns {import('./coaching-types').CoachingResult} */
export function buildCoaching(
  a,
  b,
  comparison,
  { laps = [], legacyFindings = [] } = {},
) {
  const pa = profile(a),
    pb = profile(b ?? a),
    policy = safePolicy(comparison);
  const result = {
    schemaVersion: COACHING_SCHEMA_VERSION,
    mode: "comparative",
    dataKind: pa?.kind ?? null,
    sessionId: session(pa ?? {}),
    lapAId: lapId(pa ?? {}),
    lapBId: lapId(pb ?? {}),
    findings: [],
    sections: [],
    consistency: {
      status: "insufficient-data",
      eligibleLapCount: 0,
      minimumLaps: 3,
      metrics: null,
      explanation:
        "Нужно минимум три подходящих круга одной записи и контекста; два круга не доказывают стабильность.",
    },
    withheld: [],
    policy: {
      ...COACHING_POLICY,
      alignment: { ...policy },
      thresholdsAreHeuristics: true,
      causalDiagnosis: false,
    },
    legacyEvidenceCount: Array.isArray(legacyFindings)
      ? legacyFindings.length
      : 0,
  };
  const withhold = (code, explanation, category = null) => {
    if (
      !result.withheld.some((v) => v.code === code && v.category === category)
    )
      result.withheld.push({ code, category, explanation });
  };
  if (
    !pa ||
    !pb ||
    ![pa, pb].every(
      (p) =>
        Array.isArray(p.samples) &&
        p.samples.length <= COACHING_POLICY.maxSamples,
    )
  ) {
    result.mode = "withheld";
    withhold(
      "input-bound",
      "Недостаточные данные или превышен предел 250000 наблюдений на круг.",
    );
    return result;
  }
  try {
    compatible(a, b ?? a);
  } catch {
    result.mode = "withheld";
    withhold(
      "incompatible",
      "Контекст, класс данных, время или источник дистанции не позволяют сравнение.",
    );
    return result;
  }
  if (lapId(pa) === lapId(pb)) {
    result.mode = "self-view";
    withhold(
      "self-view",
      "Выбран один круг: сравнительные советы и оценка стабильности отключены.",
    );
    return result;
  }
  if (
    !comparison?.distanceM?.length ||
    comparison.distanceM.length > COACHING_POLICY.maxGridPoints ||
    comparison.deltaS?.length !== comparison.distanceM.length ||
    !Object.values(policy).every((v) => finite(v) && v > 0)
  ) {
    result.mode = "withheld";
    withhold(
      "comparison-bound",
      "Нет ограниченной согласованной сетки сравнения.",
    );
    return result;
  }
  const grid = comparison.distanceM,
    span = grid.at(-1) - grid[0];
  if (
    grid.length < 2 ||
    Array.from(grid).some(
      (v, i) => !finite(v) || (i > 0 && v <= grid[i - 1]),
    ) ||
    span / policy.grid_m > 10000 ||
    Math.ceil(span / COACHING_POLICY.regionWidthM) >
      COACHING_POLICY.maxRegionWindows
  ) {
    result.mode = "withheld";
    withhold(
      "comparison-grid",
      "Сетка должна быть конечной, строго возрастающей и ограниченной; окна времени не вычислены.",
    );
    return result;
  }
  // Only generic topics. No car/track calibration inferred from unknown identifiers.
  withhold(
    "physical-causes",
    "Траектория, сцепление, контакт, трафик, ABS/TC и спортивная валидность этими наблюдениями не установлены.",
  );
  const signals = (keys) =>
    keys.map((key) => ({
      name: key,
      unit: pa.channels?.[key]?.unit ?? unit[key],
      sourceA: pa.channels?.[key]?.sourceChannel ?? null,
      sourceB: pb.channels?.[key]?.sourceChannel ?? null,
    }));
  const add = (category, range, ma, mb, keys, options = {}) => {
    if (result.findings.length >= COACHING_POLICY.maxFindings) {
      withhold(
        "finding-bound",
        "Число наблюдений ограничено; используйте графики для оставшихся эпизодов.",
      );
      return;
    }
    const topic = instructions[category]?.[2] ?? null;
    const synthetic = pa.kind === "synthetic";
    const warnings = [
      ...(synthetic
        ? ["Синтетические данные; вывод не является измерением LMU."]
        : []),
      ...(options.warnings ?? []),
    ];
    result.findings.push({
      id: `coach-v1:${category}:${range.map((v) => v.toFixed(3)).join(":")}`,
      category,
      severity: options.incident
        ? "priority"
        : options.inconclusive
          ? "info"
          : "notice",
      evidenceQuality: options.inconclusive
        ? "inconclusive"
        : synthetic
          ? "synthetic"
          : "observed-with-sampling-limitations",
      classification: options.inconclusive ? "inconclusive" : "observation",
      diagnosticMode: options.incident ? "incident-review" : "signal-review",
      dataKind: pa.kind,
      sessionId: session(pa),
      lapAId: lapId(pa),
      lapBId: lapId(pb),
      context: { ...pa.context },
      reference: { lapId: lapId(pa), kind: "selected-lap", ideal: false },
      distanceRangeM: [...range],
      measured: { a: ma, b: mb, signals: signals(keys) },
      qualityWarnings: warnings,
      timeImpactS: category === "time-region" ? options.timeImpactS : null,
      uncertainty: {
        timingDistanceBoundM: options.bound ?? null,
        calibrated: false,
      },
      explanation: options.explanation ?? instructions[category][0],
      action: options.action ?? instructions[category][1],
      followup:
        "Соберите повторные сопоставимые попытки и проверьте повтор в игре.",
      link: { distanceM: options.linkDistance ?? range[0], windowM: 200 },
      trainingTopic: topic,
    });
  };
  const regions = comparison.plateau
    ? []
    : timeRegions(comparison, COACHING_POLICY.regionWidthM);
  if (comparison.plateau)
    withhold(
      "distance-plateau",
      "Плато дистанции отключает дельту времени; stationary отсчёты не используются для производных и коррекций.",
    );
  for (const region of regions.slice(0, 64)) {
    const ma = summaries(pa, region.startM, region.endM, policy),
      mb = summaries(pb, region.startM, region.endM, policy);
    const incident =
      region.changeS >= 2 &&
      ma.minSpeedMps > 0 &&
      mb.minSpeedMps !== null &&
      mb.minSpeedMps <= ma.minSpeedMps * 0.5 &&
      mb.maxAbsSteering >= 0.5;
    result.sections.push({
      id: `section:${region.startM.toFixed(3)}`,
      distanceRangeM: [region.startM, region.endM],
      timeImpactS: region.changeS,
      findingIds: [],
      diagnosticMode: incident ? "incident-review" : "signal-review",
    });
    if (Math.abs(region.changeS) < 0.5) continue;
    add(
      "time-region",
      [region.startM, region.endM],
      ma,
      mb,
      ["timeS", "distanceM", "speedMps", "steeringNormalized"],
      {
        timeImpactS: region.changeS,
        incident,
        linkDistance: incident ? mb.minSpeedAtM : region.startM,
        explanation: incident
          ? "Большая локальная потеря времени сопровождается сильным замедлением и большим вводом руля. Причина эпизода неизвестна."
          : "Изменение дельты B−A на непересекающемся окне 200 м; это расчёт по t(s), не официальный сектор.",
        action: incident
          ? "Сначала проверьте повтор этого эпизода и условия; исключите контакт или трафик из оценки техники, если повтор их подтверждает."
          : "Сопоставьте скорость, педали, руль и повтор этого участка; изменение дельты не доказывает причину.",
      },
    );
  }
  const az = episodes(pa, policy),
    bz = episodes(pb, policy),
    used = new Set();
  for (const za of az) {
    const candidates = bz
      .map((z, i) => ({ z, i, distance: Math.abs(z.startM - za.startM) }))
      .filter((v) => !used.has(v.i) && v.distance <= 80)
      .sort((x, y) => x.distance - y.distance || x.i - y.i);
    if (!candidates.length) continue;
    const candidate = candidates[0],
      zb = candidate.z;
    // Two candidate episodes in the uncertainty neighbourhood are not a defensible match.
    if (candidates[1] && candidates[1].distance - candidate.distance < 5) {
      withhold(
        "ambiguous-episode",
        "Повторные торможения не позволяют однозначно сопоставить эпизод.",
      );
      continue;
    }
    used.add(candidate.i);
    const range = [
      Math.min(za.startM, zb.startM),
      Math.max(za.horizonM, zb.horizonM),
    ];
    const metric = (category, keys, threshold, fields, options = {}) => {
      if (fields.some((key) => za[key] === null || zb[key] === null)) {
        withhold(
          `missing-${category}`,
          "Нужный канал, непрерывность или частота не подтверждены.",
          category,
        );
        return;
      }
      if (Math.abs(zb[fields[0]] - za[fields[0]]) < threshold) return;
      const ma = Object.fromEntries(fields.map((key) => [key, za[key]])),
        mb = Object.fromEntries(fields.map((key) => [key, zb[key]]));
      add(
        category,
        range,
        ma,
        mb,
        [...new Set(["timeS", "distanceM", "brake", ...keys])],
        options,
      );
    };
    const bound =
      za.timingDistanceBoundM !== null && zb.timingDistanceBoundM !== null
        ? za.timingDistanceBoundM + zb.timingDistanceBoundM
        : null;
    const onsetDifference = Math.abs(zb.startM - za.startM);
    metric("brake-onset", ["distanceM", "brake", "speedMps"], 5, ["startM"], {
      bound,
      inconclusive: bound === null || onsetDifference <= bound,
      warnings:
        bound === null
          ? [
              "Неизвестна неопределённость синхронизации; направление сдвига не подтверждено.",
            ]
          : onsetDifference <= bound
            ? [
                "Сдвиг не превосходит ориентир неопределённости привязки; точный перенос торможения не обоснован.",
              ]
            : [],
    });
    metric("brake-peak", ["brake"], 0.1, ["peakBrake"]);
    metric("brake-duration", ["brake", "timeS"], 0.2, ["brakeDurationS"]);
    metric("progressive-release", ["brake", "timeS"], 0.2, [
      "releaseDurationS",
      "releaseWithinRiseToleranceFraction",
      "releaseReapplications",
    ]);
    metric("pedal-overlap", ["brake", "throttle", "timeS"], 0.2, [
      "pedalOverlapS",
    ]);
    metric("steering-overlap", ["brake", "steeringNormalized", "timeS"], 0.2, [
      "steeringOverlapS",
    ]);
    for (const [category, key] of [
      ["speed-minimum", "minSpeedMps"],
      ["entry-speed", "entrySpeedMps"],
      ["recovery-speed", "recoverySpeedMps"],
    ])
      metric(category, ["speedMps", "distanceM"], 3 / 3.6, [key]);
    const throttleBound =
      za.throttleDistanceBoundM !== null && zb.throttleDistanceBoundM !== null
        ? za.throttleDistanceBoundM + zb.throttleDistanceBoundM
        : null;
    metric(
      "sustained-throttle",
      ["throttle", "timeS", "distanceM"],
      5,
      ["sustainedThrottleM"],
      {
        bound: throttleBound,
        inconclusive:
          throttleBound === null ||
          Math.abs(zb.sustainedThrottleM - za.sustainedThrottleM) <=
            throttleBound,
        warnings:
          throttleBound === null
            ? ["Неизвестна неопределённость привязки газа."]
            : [],
      },
    );
    metric("low-throttle", ["throttle", "timeS", "distanceM"], 0.3, [
      "lowThrottleS",
      "lowThrottleM",
    ]);
    metric("exit-acceleration", ["speedMps", "timeS"], 0.5, [
      "exitAccelerationMps2",
    ]);
    metric(
      "steering-activity",
      ["steeringNormalized", "timeS", "speedMps"],
      0.3,
      ["steeringActivity", "steeringCorrections"],
    );
  }
  for (const section of result.sections)
    section.findingIds = result.findings
      .filter(
        (f) =>
          f.distanceRangeM[0] <= section.distanceRangeM[1] &&
          f.distanceRangeM[1] >= section.distanceRangeM[0],
      )
      .map((f) => f.id);
  const eligible = [],
    unique = new Set();
  for (const lap of laps.slice(0, 64)) {
    const p = profile(lap);
    if (
      !p ||
      unique.has(lapId(p)) ||
      lap.validation?.eligible !== true ||
      lap.validation?.pit !== false ||
      lap.validation?.metadataComplete === false ||
      lap.validation?.pitStateKnown === false ||
      !finite(lap.validation?.recordedTimeS) ||
      lap.validation.recordedTimeS <= 0
    )
      continue;
    try {
      compatible(a, lap);
    } catch {
      continue;
    }
    unique.add(lapId(p));
    eligible.push(lap.validation.recordedTimeS);
  }
  result.consistency.eligibleLapCount = eligible.length;
  if (eligible.length >= 3) {
    const sorted = [...eligible].sort((x, y) => x - y),
      mean = eligible.reduce((sum, v) => sum + v, 0) / eligible.length;
    result.consistency = {
      status: "descriptive",
      eligibleLapCount: eligible.length,
      minimumLaps: 3,
      metrics: {
        recordedTimeRangeS: sorted.at(-1) - sorted[0],
        recordedTimeMedianS:
          sorted.length % 2
            ? sorted[(sorted.length - 1) / 2]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
        recordedTimeStdDevS: Math.sqrt(
          eligible.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
            eligible.length,
        ),
      },
      explanation:
        "Описательный разброс записанных времён; условия и чистота попыток не нормализованы, спортивная валидность отдельно не подтверждена.",
    };
  } else
    withhold(
      "consistency-insufficient",
      result.consistency.explanation,
      "consistency",
    );
  return result;
}
