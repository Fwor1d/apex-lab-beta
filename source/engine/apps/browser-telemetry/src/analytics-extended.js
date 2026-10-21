import { brakingEpisodes } from "./coaching-engine.js";
import { compatible, DEFAULT_POLICY, timeRegions } from "./analysis.js";
export const EXTENDED_POLICY = Object.freeze({
  version: "1.0.0",
  microWindowM: 50,
  maxEpisodes: 256,
  maxLaps: 64,
  maxSamples: 250000,
  minimumLaps: 3,
  matchDistanceM: 80,
  brakeThreshold: 0.1,
  steeringThreshold: 0.1,
});
const finite = Number.isFinite,
  profile = (lap) => lap.profile ?? lap;
const has = (p, k) =>
  p.channels?.[k]?.status && p.channels[k].status !== "missing";
function rangeStats(values) {
  if (!values.length || values.some((v) => !finite(v))) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mean = values.reduce((n, v) => n + v, 0) / values.length;
  return {
    count: values.length,
    minimum: sorted[0],
    maximum: sorted.at(-1),
    range: sorted.at(-1) - sorted[0],
    mean,
    stdDev: Math.sqrt(
      values.reduce((n, v) => n + (v - mean) ** 2, 0) / values.length,
    ),
  };
}
export function characterizeLap(lap, policy = DEFAULT_POLICY) {
  const p = profile(lap);
  if (
    !Array.isArray(p?.samples) ||
    p.samples.length > EXTENDED_POLICY.maxSamples
  )
    throw Error("Превышен предел расширенной аналитики.");
  const episodes = brakingEpisodes(p, policy);
  let cursor = 0;
  return episodes.map((e) => {
    while (
      cursor < p.samples.length &&
      (!finite(p.samples[cursor].distanceM) ||
        p.samples[cursor].distanceM < e.startM)
    )
      cursor++;
    let brakeIntegral = 0,
      releaseCoordination = 0,
      peak = -1,
      peakTime = null,
      releaseEndTime = null,
      maxReleaseRate = 0,
      complete = true,
      coordinationComplete = has(p, "steeringNormalized"),
      links = 0;
    for (let i = cursor + 1; i < p.samples.length; i++) {
      const a = p.samples[i - 1],
        b = p.samples[i];
      if (finite(b.distanceM) && b.distanceM > e.endM) break;
      const dt = b.timeS - a.timeS,
        ds = b.distanceM - a.distanceM;
      if (
        [a.timeS, b.timeS, a.distanceM, b.distanceM, a.brake, b.brake].some(
          (v) => !finite(v),
        ) ||
        dt <= 0 ||
        dt > policy.max_time_gap_s ||
        ds <= 0 ||
        ds > policy.max_distance_gap_m
      ) {
        complete = false;
        continue;
      }
      links++;
      brakeIntegral += (a.brake + b.brake) * 0.5 * dt;
      if (a.brake > peak) {
        peak = a.brake;
        peakTime = a.timeS;
      }
      releaseEndTime = b.timeS;
      maxReleaseRate = Math.max(maxReleaseRate, (a.brake - b.brake) / dt);
      if (
        !has(p, "steeringNormalized") ||
        !finite(a.steeringNormalized) ||
        !finite(b.steeringNormalized)
      ) {
        coordinationComplete = false;
        continue;
      }
      // Input relationship only; no physical trail braking/grip inference.
      if (
        a.brake >= 0.1 &&
        b.brake >= 0.1 &&
        b.brake < a.brake &&
        Math.abs(a.steeringNormalized) >= 0.1 &&
        Math.abs(b.steeringNormalized) > Math.abs(a.steeringNormalized)
      )
        releaseCoordination += dt;
    }
    const hz = p.channels?.brake?.sampling?.nativeFrequencyHz;
    return {
      ...e,
      brakeIntegralRatioS: complete && links ? brakeIntegral : null,
      releaseCoordinationS:
        complete && coordinationComplete && links ? releaseCoordination : null,
      maxReleaseRateRatioPerS:
        complete && finite(hz) && hz >= 10 && links ? maxReleaseRate : null,
      peakToReleaseS:
        complete && peakTime !== null && releaseEndTime !== null
          ? releaseEndTime - peakTime
          : null,
      timeImpactS: null,
      classification: "input-observation",
      pressureMeasured: false,
    };
  });
}
export function recurringPatterns(reference, laps, policy = DEFAULT_POLICY) {
  const selected = [],
    ids = new Set();
  for (const lap of laps.slice(0, EXTENDED_POLICY.maxLaps)) {
    const p = profile(lap),
      id = p.provenance?.lapId;
    if (
      ids.has(id) ||
      !lap.validation?.eligible ||
      lap.validation?.pit !== false ||
      lap.validation?.pitStateKnown === false ||
      lap.validation?.metadataComplete === false
    )
      continue;
    try {
      compatible(reference, lap);
    } catch {
      continue;
    }
    ids.add(id);
    selected.push(lap);
  }
  if (selected.length < 3)
    return {
      status: "insufficient-data",
      eligibleLapCount: selected.length,
      minimumLaps: 3,
      patterns: [],
      explanation:
        "Для повторяемости техники нужны ≥3 разных подходящих круга одной записи. Два круга не доказывают устойчивый паттерн.",
    };
  const base = characterizeLap(reference, policy),
    others = selected.map((l) => characterizeLap(l, policy)),
    used = others.map(() => new Set()),
    patterns = [];
  for (const e of base) {
    const matched = others
      .map((list, j) => {
        const candidates = list
          .map((v, i) => ({ v, i, d: Math.abs(v.startM - e.startM) }))
          .filter((c) => c.d <= 80 && !used[j].has(c.i))
          .sort((a, b) => a.d - b.d);
        if (
          !candidates.length ||
          (candidates[1] && candidates[1].d - candidates[0].d < 5)
        )
          return null;
        used[j].add(candidates[0].i);
        return candidates[0].v;
      })
      .filter(Boolean);
    if (matched.length < 3) continue;
    const metricKeys = [
      "startM",
      "minSpeedMps",
      "sustainedThrottleM",
      "brakeIntegralRatioS",
      "steeringActivity",
    ];
    patterns.push({
      distanceRangeM: [e.startM, e.horizonM],
      matchedLapCount: matched.length,
      metrics: Object.fromEntries(
        metricKeys.map((k) => [k, rangeStats(matched.map((v) => v[k]))]),
      ),
      timingDistanceBoundM: matched.every((v) => finite(v.timingDistanceBoundM))
        ? Math.max(...matched.map((v) => v.timingDistanceBoundM))
        : null,
      timeImpactS: null,
      explanation:
        "Описательный разброс сопоставленных действий. Условия и причина различий не установлены; метрический разброс включает неопределённость синхронизации.",
    });
  }
  return {
    status: "descriptive",
    eligibleLapCount: selected.length,
    minimumLaps: 3,
    patterns,
    explanation:
      "Разброс действий не равен диагнозу повторяющейся ошибки. Нет статистической сертификации одинаковых условий.",
  };
}
export function buildExtended(a, b, comparison, { laps = [] } = {}) {
  compatible(a, b);
  if (
    !comparison?.distanceM?.length ||
    comparison.distanceM.length > 10001 ||
    comparison.deltaS.length !== comparison.distanceM.length ||
    Array.from(comparison.distanceM).some(
      (v, i) => !finite(v) || (i && v <= comparison.distanceM[i - 1]),
    )
  )
    throw Error("Непригодная сетка расширенной аналитики.");
  const policy = { ...DEFAULT_POLICY, ...comparison.policy };
  if (!Object.values(policy).every((v) => finite(v) && v > 0))
    throw Error("Некорректная политика интерполяции.");
  const span = comparison.distanceM.at(-1) - comparison.distanceM[0];
  if (span > 25600) throw Error("Превышен предел микросегментов.");
  return {
    schemaVersion: "1.0.0",
    dataKind: profile(a).kind,
    a: characterizeLap(a, policy),
    b: characterizeLap(b, policy),
    microSegments: comparison.plateau
      ? []
      : timeRegions(comparison, 50)
          .slice(0, 512)
          .map((r) => ({
            ...r,
            ownership: "alternative-resolution; do not add to coaching windows",
          })),
    recurring: recurringPatterns(a, laps, policy),
    policy: EXTENDED_POLICY,
    notice:
      "Метрики действий рассчитаны по нормированным сигналам. Тормоз — положение педали, не давление. Совместный релиз/руль — кандидат техники, не доказательство сцепления. Окна 50 м — другая детализация той же дельты, их нельзя суммировать с окнами Coach. Оценки навыка и обещания выигрыша отсутствуют.",
  };
}
