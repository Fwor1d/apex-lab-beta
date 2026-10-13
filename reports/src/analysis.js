/** Python analysis.py parity. NaN is an internal missing-value sentinel only. */
export const DEFAULT_POLICY = Object.freeze({
  grid_m: 2,
  max_distance_gap_m: 25,
  max_time_gap_s: 0.25,
});
const KEYS = ["timeS", "speedMps", "brake", "throttle", "steeringNormalized"];
const finite = Number.isFinite;
const profileOf = (lap) => lap.profile ?? lap;
const sessionOf = (lap) => {
  const p = profileOf(lap);
  return p.provenance.sessionId ?? p.provenance.sourceId;
};
const array = (lap, key) =>
  Float64Array.from(profileOf(lap).samples, (s) =>
    finite(s[key]) ? s[key] : NaN,
  );
function policyOf(policy) {
  const result = { ...DEFAULT_POLICY, ...policy };
  if (!Object.values(result).every((v) => finite(v) && v > 0))
    throw new Error(
      "Шаг и пределы разрыва должны быть конечными положительными числами.",
    );
  return result;
}
function lowerBound(values, value) {
  let lo = 0,
    hi = values.length;
  while (lo < hi) {
    const middle = (lo + hi) >>> 1;
    if (values[middle] < value) lo = middle + 1;
    else hi = middle;
  }
  return lo;
}
export function compatible(a, b) {
  const pa = profileOf(a),
    pb = profileOf(b);
  if ([pa, pb].some((p) => p.kind === "educational"))
    throw new Error(
      "Учебная модель не используется для измеренного сравнения кругов.",
    );
  if (
    pa.provenance.lapId !== pb.provenance.lapId &&
    [a, b].some(
      (lap) =>
        lap.validation?.metadataComplete === false ||
        lap.validation?.pitStateKnown === false,
    )
  )
    throw new Error(
      "Контекст записи или состояние пит-лейна не подтверждены для сравнения кругов.",
    );
  const ca = Object.keys(pa.context).sort(),
    cb = Object.keys(pb.context).sort();
  if (
    ca.length !== cb.length ||
    ca.some((key, i) => key !== cb[i] || pa.context[key] !== pb.context[key]) ||
    sessionOf(a) !== sessionOf(b) ||
    pa.kind !== pb.kind
  )
    throw new Error(
      "Сравниваются только круги одной сессии, автомобиля, трассы, конфигурации и класса данных.",
    );
  if (
    !pa.provenance.distanceBasis ||
    pa.provenance.distanceBasis !== pb.provenance.distanceBasis
  )
    throw new Error("Общий источник и ноль дистанции не подтверждены.");
  for (const p of [pa, pb])
    for (const key of ["timeS", "distanceM"])
      if (!p.channels[key] || p.channels[key].status === "missing")
        throw new Error("Для сравнения нужны время и дистанция.");
}
export function interpolate(lap, key, grid, policy = DEFAULT_POLICY) {
  policy = policyOf(policy);
  const distance = array(lap, "distanceM"),
    time = array(lap, "timeS"),
    values = array(lap, key);
  const indices = [],
    distances = [];
  for (let i = 0; i < distance.length; i++)
    if (finite(distance[i])) {
      indices.push(i);
      distances.push(distance[i]);
    }
  const result = new Float64Array(grid.length).fill(NaN);
  if (!indices.length) return result;
  for (let j = 0; j < grid.length; j++) {
    const right = lowerBound(distances, grid[j]);
    const exact = indices[Math.min(right, indices.length - 1)];
    if (
      finite(time[exact]) &&
      finite(values[exact]) &&
      Math.abs(grid[j] - distance[exact]) <= 1e-8
    ) {
      result[j] = values[exact];
      continue;
    }
    if (!right || right >= indices.length) continue;
    const lo = indices[right - 1],
      hi = indices[right];
    const ds = distance[hi] - distance[lo],
      dt = time[hi] - time[lo];
    if (
      hi !== lo + 1 ||
      !finite(time[lo]) ||
      !finite(time[hi]) ||
      !finite(values[lo]) ||
      !finite(values[hi]) ||
      ds <= 0 ||
      ds > policy.max_distance_gap_m ||
      dt > policy.max_time_gap_s
    )
      continue;
    result[j] =
      values[lo] + ((values[hi] - values[lo]) * (grid[j] - distance[lo])) / ds;
  }
  return result;
}
export function compare(a, b, policy = DEFAULT_POLICY) {
  policy = policyOf(policy);
  compatible(a, b);
  const ranges = [a, b].map((lap) => array(lap, "distanceM").filter(finite));
  if (ranges.some((v) => v.length < 2))
    throw new Error("Недостаточно точек дистанции.");
  const start = Math.max(...ranges.map((v) => v[0]));
  const end = Math.min(...ranges.map((v) => v.at(-1)));
  if (end <= start) throw new Error("Нет общей области дистанции.");
  if ((end - start) / policy.grid_m > 10000)
    throw new Error("Сетка сравнения превышает 10000 точек.");
  // numpy.arange adds the floating-point step (start+step)-start repeatedly.
  const step = start + policy.grid_m - start;
  const count = Math.ceil((end - start) / policy.grid_m);
  const points = Array.from({ length: count }, (_, i) => start + i * step);
  if (points.at(-1) !== end) points.push(end);
  const distanceM = Float64Array.from(points);
  const aligned = [a, b].map((lap) =>
    Object.fromEntries(
      KEYS.map((key) => [key, interpolate(lap, key, distanceM, policy)]),
    ),
  );
  const plateau = [a, b].some((lap) => {
    const d = array(lap, "distanceM");
    return d.some((v, i) => i > 0 && v - d[i - 1] === 0);
  });
  const deltaS = Float64Array.from(
    distanceM,
    (_, i) => aligned[1].timeS[i] - aligned[0].timeS[i],
  );
  const origin = deltaS.findIndex(finite);
  if (plateau) deltaS.fill(NaN);
  else if (origin >= 0) {
    const zero = deltaS[origin];
    for (let i = 0; i < deltaS.length; i++) deltaS[i] -= zero;
  }
  return {
    distanceM,
    a: aligned[0],
    b: aligned[1],
    deltaS,
    coverage: deltaS.filter(finite).length / deltaS.length,
    plateau,
    originM: origin >= 0 && !plateau ? distanceM[origin] : null,
    policy,
  };
}
export function timeRegions(comparison, width = 200) {
  if (!finite(width) || width <= 0)
    throw new Error("Ширина участка должна быть положительной.");
  const d = comparison.distanceM,
    delta = comparison.deltaS,
    regions = [];
  const step = d[0] + width - d[0];
  const count = Math.ceil((d.at(-1) - d[0]) / width);
  for (let j = 0; j < count; j++) {
    const start = d[0] + j * step;
    const indices = [];
    for (let i = 0; i < d.length; i++)
      if (d[i] >= start && d[i] <= start + width) indices.push(i);
    if (indices.length < 2 || indices.some((i) => !finite(delta[i]))) continue;
    const lo = indices[0],
      hi = indices.at(-1);
    regions.push({
      startM: d[lo],
      endM: d[hi],
      changeS: delta[hi] - delta[lo],
    });
  }
  return regions.sort((a, b) => Math.abs(b.changeS) - Math.abs(a.changeS));
}
export function brakingZones(lap, policy = DEFAULT_POLICY) {
  policy = policyOf(policy);
  const [d, t, brake, speed, throttle] = [
    "distanceM",
    "timeS",
    "brake",
    "speedMps",
    "throttle",
  ].map((key) => array(lap, key));
  const usable = (i) => finite(d[i]) && finite(t[i]) && finite(brake[i]);
  const adjacent = (lo, hi) =>
    t[hi] - t[lo] <= policy.max_time_gap_s &&
    d[hi] - d[lo] > 0 &&
    d[hi] - d[lo] <= policy.max_distance_gap_m;
  const zones = [];
  let i = 1;
  while (i < d.length) {
    if (!(
      usable(i) &&
      usable(i - 1) &&
      brake[i - 1] < 0.1 &&
      brake[i] >= 0.1 &&
      adjacent(i - 1, i)
    )) {
      i++;
      continue;
    }
    const start = i;
    while (
      i + 1 < d.length &&
      usable(i + 1) &&
      adjacent(i, i + 1) &&
      brake[i + 1] >= 0.05
    )
      i++;
    const end = i;
    const complete =
      end + 1 < d.length &&
      usable(end + 1) &&
      brake[end + 1] < 0.05 &&
      adjacent(end, end + 1);
    let horizon = end + 1;
    while (
      horizon + 1 < d.length &&
      finite(d[horizon + 1]) &&
      finite(t[horizon + 1]) &&
      adjacent(horizon, horizon + 1) &&
      d[horizon + 1] - d[end] <= 150 &&
      !(finite(brake[horizon + 1]) && brake[horizon + 1] >= 0.1)
    )
      horizon++;
    let pickup = null,
      minimum = null,
      peak = -Infinity;
    for (let j = start; j <= end; j++) peak = Math.max(peak, brake[j]);
    for (let j = start; j <= Math.min(horizon, d.length - 1); j++)
      if (finite(speed[j]) && (minimum === null || speed[j] < speed[minimum]))
        minimum = j;
    for (let j = end + 1; j <= Math.min(horizon, d.length - 1); j++)
      if (
        finite(throttle[j - 1]) &&
        finite(throttle[j]) &&
        throttle[j - 1] < 0.2 &&
        throttle[j] >= 0.2
      ) {
        pickup = j;
        break;
      }
    zones.push({
      startM: d[start],
      endM: complete ? d[end + 1] : null,
      peakBrake: peak,
      minSpeedMps: minimum === null ? null : speed[minimum],
      minSpeedAtM: minimum === null ? null : d[minimum],
      throttlePickupM: pickup === null ? null : d[pickup],
      complete,
    });
    i++;
  }
  return zones;
}
function timingDistanceBound(lap, zone) {
  const p = profileOf(lap);
  const uncertainty = ["distanceM", "brake"].reduce(
    (s, key) => s + (p.channels[key]?.sampling?.timeUncertaintyS ?? 0),
    0,
  );
  const d = array(lap, "distanceM"),
    speed = array(lap, "speedMps");
  let nearest = -1;
  for (let i = 0; i < d.length; i++)
    if (
      finite(d[i]) &&
      finite(speed[i]) &&
      (nearest < 0 ||
        Math.abs(d[i] - zone.startM) < Math.abs(d[nearest] - zone.startM))
    )
      nearest = i;
  return nearest >= 0 && uncertainty ? speed[nearest] * uncertainty : null;
}
export function coach(a, b, comparison) {
  const findings = [];
  for (const region of timeRegions(comparison).slice(0, 3)) {
    if (Math.abs(region.changeS) < 0.5) continue;
    const evidence = {
      a: {},
      b: {},
      channels: ["timeS", "distanceM", "speedMps", "steeringNormalized"],
      timingDistanceBoundM: null,
    };
    const descriptions = [];
    for (const [label, lap] of [
      ["A", a],
      ["B", b],
    ]) {
      const d = array(lap, "distanceM"),
        speed = array(lap, "speedMps"),
        steering = array(lap, "steeringNormalized");
      let minimum = null,
        maximum = null;
      for (let i = 0; i < d.length; i++)
        if (d[i] >= region.startM && d[i] <= region.endM) {
          if (finite(speed[i]))
            minimum = minimum === null ? speed[i] : Math.min(minimum, speed[i]);
          if (finite(steering[i]))
            maximum =
              maximum === null
                ? Math.abs(steering[i])
                : Math.max(maximum, Math.abs(steering[i]));
        }
      evidence[label.toLowerCase()] = {
        startM: region.startM,
        endM: region.endM,
        minSpeedMps: minimum,
        maxAbsSteering: maximum,
      };
      descriptions.push(
        `${label}: ${minimum === null ? "скорость отсутствует" : `минимум ${(minimum * 3.6).toFixed(1)} км/ч`}${maximum === null ? "" : `, |руль| до ${(maximum * 100).toFixed(0)}%`}`,
      );
    }
    findings.push({
      classification: "observation",
      category: "time-region",
      evidence,
      text: `Участок ${region.startM.toFixed(0)}–${region.endM.toFixed(0)} м: B ${region.changeS > 0 ? "потерял" : "отыграл"} ${Math.abs(region.changeS).toFixed(3)} с по t(s). ${descriptions.join("; ")}.`,
      action:
        "Начните с повтора этого участка в игре и сравните скорость, педали и коррекции руля. Причина потери, контакт, трафик или разворот этими каналами не доказаны.",
    });
  }
  const az = brakingZones(a, comparison.policy),
    bz = brakingZones(b, comparison.policy),
    used = new Set();
  for (const za of az) {
    const candidates = bz
      .map((z, i) => ({ distance: Math.abs(z.startM - za.startM), i, z }))
      .filter((v) => !used.has(v.i))
      .sort((x, y) => x.distance - y.distance);
    if (!candidates.length) continue;
    const { distance, i, z: zb } = candidates[0];
    if (distance > 80 || !za.complete || !zb.complete) continue;
    used.add(i);
    const bounds = [timingDistanceBound(a, za), timingDistanceBound(b, zb)];
    const evidence = {
      a: za,
      b: zb,
      channels: ["distanceM", "brake", "speedMps", "throttle"],
      timingDistanceBoundM: bounds.every((v) => v !== null)
        ? bounds[0] + bounds[1]
        : null,
    };
    let shift = zb.startM - za.startM;
    const add = (category, text, action) =>
      findings.push({
        classification: "observation",
        category,
        text,
        evidence,
        action,
      });
    if (Math.abs(shift) >= 5)
      add(
        "braking-point",
        `В зоне ${za.startM.toFixed(0)} м B начинает торможение на ${Math.abs(shift).toFixed(0)} м ${shift > 0 ? "позже" : "раньше"} A (порог 10% тормоза).`,
        "Проверьте скорость подхода и итоговую дельту участка. Более поздний тормоз сам по себе не означает выигрыш.",
      );
    if (
      za.minSpeedMps !== null &&
      zb.minSpeedMps !== null &&
      Math.abs((zb.minSpeedMps - za.minSpeedMps) * 3.6) >= 3
    )
      add(
        "speed-minimum",
        `Минимум наблюдаемой скорости в этой зоне: A ${(za.minSpeedMps * 3.6).toFixed(1)}, B ${(zb.minSpeedMps * 3.6).toFixed(1)} км/ч.`,
        "Проверьте потери до и после минимума. Без линии, трафика и условий причина разницы остаётся гипотезой.",
      );
    if (za.throttlePickupM !== null && zb.throttlePickupM !== null) {
      shift = zb.throttlePickupM - za.throttlePickupM;
      if (Math.abs(shift) >= 5)
        add(
          "throttle-pickup",
          `Пересечение 20% газа после торможения: B на ${Math.abs(shift).toFixed(0)} м ${shift > 0 ? "позже" : "раньше"} A.`,
          "Сопоставьте с ускорением и рулём на выходе; ранний газ не доказывает лучшее сцепление.",
        );
    }
    const release = zb.endM - zb.startM - (za.endM - za.startM);
    if (Math.abs(release) >= 10)
      add(
        "brake-release",
        `Дистанция от начала торможения до отпускания ниже 5%: B ${release > 0 ? "длиннее" : "короче"} A на ${Math.abs(release).toFixed(0)} м.`,
        "Сравните форму релиза на графике. Без геометрии поворота это не доказательство неправильного trail braking.",
      );
  }
  for (const finding of findings) {
    if (
      finding.category !== "time-region" &&
      !finding.text.startsWith("В зоне")
    )
      finding.text = `Зона ${finding.evidence.a.startM.toFixed(0)} м · ${finding.text}`;
    const bound = finding.evidence.timingDistanceBoundM;
    if (bound)
      finding.action += ` Ориентир неопределённости привязки точек тормоза: до ≈${bound.toFixed(0)} м суммарно; это не доверительный интервал.`;
    // Additive coaching-engine fields; existing evidence stays identical to Python.
    finding.referenceLapId =
      profileOf(a).provenance.lapId ?? profileOf(a).provenance.fixtureLabel;
    finding.confidence = "observed-with-sampling-limitations";
    finding.distanceRangeM = [
      finding.evidence.a.startM,
      finding.evidence.a.endM,
    ];
    finding.estimatedTimeImpactS =
      finding.category === "time-region"
        ? (timeRegions(comparison).find(
            (r) => r.startM === finding.evidence.a.startM,
          )?.changeS ?? null)
        : null;
  }
  return findings;
}
/** Serialize typed arrays without turning gaps into fabricated zeros. */
export function toPortableNumbers(value) {
  if (typeof value === "number") return finite(value) ? value : null;
  if (Array.isArray(value) || ArrayBuffer.isView(value))
    return Array.from(value, toPortableNumbers);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, toPortableNumbers(v)]),
    );
  return value;
}
