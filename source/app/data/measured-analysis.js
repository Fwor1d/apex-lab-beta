// Presentation adapter only. The immutable Worker comparison is the numerical authority.
import { DEFAULT_POLICY } from "../../engine/apps/browser-telemetry/src/analysis.js";
import { validatePortableProfile } from "../../engine/apps/mobile/src/profile-contract.js";

export const SIGNAL_KEYS = [
  "timeS",
  "speedMps",
  "brake",
  "throttle",
  "steeringNormalized",
];
const finite = Number.isFinite;
export const nullable = (value) => (finite(value) ? value : null);
export function lowerBound(values, value, select = (x) => x) {
  let lo = 0,
    hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (select(values[mid]) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// One monotone, piecewise measured mapping. No extrapolation, nearest point, or lap-duration scaling.
// Duplicate coordinates are ambiguous even at an exact point. Missing rows split runs.
export function measuredMapping(
  samples,
  policy = DEFAULT_POLICY,
  bounds = [-Infinity, Infinity],
) {
  const bad = new Uint8Array(samples.length);
  let monotone = true;
  for (const key of ["timeS", "distanceM"]) {
    let previous = -1;
    for (let i = 0; i < samples.length; i++) {
      if (!finite(samples[i][key])) {
        bad[i] = 1;
        continue;
      }
      if (previous >= 0) {
        if (samples[i][key] < samples[previous][key]) monotone = false;
        if (samples[i][key] === samples[previous][key])
          bad[i] = bad[previous] = 1;
      }
      previous = i;
    }
  }
  const runs = [];
  if (monotone)
    for (let i = 0; i < samples.length; i++) {
      if (bad[i]) continue;
      const p = samples[i],
        prev = samples[i - 1],
        last = runs.at(-1);
      const joined =
        last &&
        last.end === i - 1 &&
        p.distanceM - prev.distanceM <= policy.max_distance_gap_m &&
        p.timeS - prev.timeS <= policy.max_time_gap_s;
      if (joined) last.end = i;
      else runs.push({ start: i, end: i });
    }
  const interpolate = (run, key, value, target) => {
    const first = samples[run.start],
      last = samples[run.end];
    if (value < first[key] || value > last[key]) return null;
    let lo = run.start,
      hi = run.end;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (samples[m][key] < value) lo = m + 1;
      else hi = m;
    }
    const right = samples[lo];
    if (right[key] === value) return right[target];
    const left = samples[lo - 1];
    return (
      left[target] +
      ((right[target] - left[target]) * (value - left[key])) /
        (right[key] - left[key])
    );
  };
  const intervals = [];
  for (const run of runs) {
    const startM = Math.max(bounds[0], samples[run.start].distanceM),
      endM = Math.min(bounds[1], samples[run.end].distanceM);
    if (endM < startM) continue;
    intervals.push({
      ...run,
      startM,
      endM,
      startS: interpolate(run, "distanceM", startM, "timeS"),
      endS: interpolate(run, "distanceM", endM, "timeS"),
    });
  }
  function find(key, value) {
    if (!finite(value)) return null;
    const end = key === "distanceM" ? "endM" : "endS",
      start = key === "distanceM" ? "startM" : "startS";
    const run = intervals[lowerBound(intervals, value, (r) => r[end])];
    return run && value >= run[start] ? run : null;
  }
  return {
    intervals,
    reason: !monotone
      ? "non-monotone"
      : !intervals.length
        ? "unavailable"
        : intervals.length > 1
          ? "gaps-or-ambiguity"
          : null,
    timeAt(d) {
      const run = find("distanceM", d);
      return run ? interpolate(run, "distanceM", d, "timeS") : null;
    },
    distanceAt(t) {
      const run = find("timeS", t);
      return run ? interpolate(run, "timeS", t, "distanceM") : null;
    },
    endAt(t) {
      return find("timeS", t)?.endS ?? null;
    },
    connected(lo, hi) {
      const run = find("distanceM", lo);
      return !!run && hi >= lo && hi <= run.endM;
    },
  };
}

function checkProfile(profile, descriptor, lapId) {
  validatePortableProfile(profile);
  if (
    profile.provenance.sessionId !== descriptor.id ||
    profile.provenance.lapId !== lapId ||
    profile.kind !== descriptor.kind ||
    profile.provenance.sha256 !== descriptor.recording.sha256
  )
    throw Error("PROFILE_IDENTITY");
}
export function prepareMeasuredAnalysis(
  descriptor,
  a,
  b,
  profileA,
  profileB,
  result,
) {
  checkProfile(profileA, descriptor, a);
  checkProfile(profileB, descriptor, b);
  if (result?.pair?.[0] !== a || result?.pair?.[1] !== b)
    throw Error("PAIR_IDENTITY");
  const c = result.comparison,
    n = c?.distanceM?.length;
  if (
    !n ||
    n > 10002 ||
    typeof c.plateau !== "boolean" ||
    !finite(c.coverage) ||
    c.coverage < 0 ||
    c.coverage > 1
  )
    throw Error("COMPARISON_SHAPE");
  for (const [key, value] of Object.entries(DEFAULT_POLICY))
    if (c.policy?.[key] !== value) throw Error("COMPARISON_POLICY");
  const arrays = [
    c.distanceM,
    c.deltaS,
    ...SIGNAL_KEYS.flatMap((key) => [c.a?.[key], c.b?.[key]]),
  ];
  if (arrays.some((v) => !(v instanceof Float64Array) || v.length !== n))
    throw Error("COMPARISON_ARRAYS");
  if (c.distanceM.some((d, i) => !finite(d) || (i && d <= c.distanceM[i - 1])))
    throw Error("COMPARISON_GRID");
  const validDelta = c.deltaS.reduce((n, v) => n + Number(finite(v)), 0);
  if (
    c.coverage !== validDelta / n ||
    (c.plateau && validDelta) ||
    (c.originM !== null && !c.distanceM.includes(c.originM))
  )
    throw Error("COMPARISON_QUALITY");
  const bounds = [c.distanceM[0], c.distanceM.at(-1)];
  const profiles = { [a]: profileA, [b]: profileB };
  const mappings = {
    [a]: measuredMapping(profileA.samples, c.policy, bounds),
    [b]: measuredMapping(profileB.samples, c.policy, bounds),
  };
  const connections = { a: {}, b: {} };
  // Gap masks are prepared once, also detecting native gaps that fall between grid points.
  for (const [role, id] of [
    ["a", a],
    ["b", b],
  ]) {
    for (const key of SIGNAL_KEYS) {
      const samples = profiles[id].samples;
      const channelSamples =
        key === "timeS"
          ? samples
          : samples.map((p) =>
              finite(p[key]) ? p : { timeS: null, distanceM: null },
            );
      const mapping =
        key === "timeS"
          ? mappings[id]
          : measuredMapping(channelSamples, c.policy, bounds);
      connections[role][key] = Uint8Array.from(c.distanceM, (d, i) =>
        i > 0 &&
        finite(c[role][key][i - 1]) &&
        finite(c[role][key][i]) &&
        mapping.connected(c.distanceM[i - 1], d)
          ? 1
          : 0,
      );
    }
  }
  const deltaConnections = Uint8Array.from(c.distanceM, (_, i) =>
    i &&
    finite(c.deltaS[i - 1]) &&
    finite(c.deltaS[i]) &&
    connections.a.timeS[i] &&
    connections.b.timeS[i]
      ? 1
      : 0,
  );
  const deltaBreaks = new Uint32Array(n);
  for (let i = 1; i < n; i++)
    deltaBreaks[i] = deltaBreaks[i - 1] + (deltaConnections[i] ? 0 : 1);
  const series = (id, key) =>
    key === "deltaS" ? c.deltaS : c[id === a ? "a" : "b"][key];
  const links = (id, key) =>
    key === "deltaS"
      ? deltaConnections
      : connections[id === a ? "a" : "b"][key];
  const sample = (id, key, d) => {
    if (
      ![a, b].includes(id) ||
      !finite(d) ||
      (!SIGNAL_KEYS.includes(key) && key !== "deltaS")
    )
      return null;
    const i = lowerBound(c.distanceM, d),
      values = series(id, key);
    if (i >= n) return null;
    if (c.distanceM[i] === d) return nullable(values[i]);
    if (!i || !links(id, key)[i]) return null;
    return nullable(
      values[i - 1] +
        ((values[i] - values[i - 1]) * (d - c.distanceM[i - 1])) /
          (c.distanceM[i] - c.distanceM[i - 1]),
    );
  };
  let last = n - 1;
  while (last >= 0 && !finite(c.deltaS[last])) last--;
  const recorded = (id) =>
    descriptor.laps.find((l) => l.id === id)?.validation.recordedTimeS ?? null;
  const recordedA = recorded(a),
    recordedB = recorded(b);
  const channels = Object.fromEntries(
    SIGNAL_KEYS.map((key) => [
      key,
      Object.fromEntries(
        ["a", "b"].map((role) => {
          const count = c[role][key].reduce(
            (n, value) => n + Number(finite(value)),
            0,
          );
          return [
            role,
            count === n ? "available" : count ? "partial" : "unavailable",
          ];
        }),
      ),
    ]),
  );
  const continuityBreaks = deltaBreaks[n - 1];
  const partial =
    continuityBreaks > 0 ||
    c.coverage < 1 ||
    Object.values(channels).some((v) =>
      Object.values(v).some((s) => s !== "available"),
    ) ||
    mappings[b].intervals.length !== 1;
  const summary = Object.freeze({
    phase: partial ? "partial" : "ready",
    message: partial
      ? "Сравнение доступно с ограничениями каналов или покрытия."
      : "Сравнение готово.",
    pair: Object.freeze({ sessionId: descriptor.id, a, b }),
    bounds: Object.freeze(bounds),
    gridPoints: n,
    continuityBreaks,
    coverage: c.coverage,
    plateau: c.plateau,
    originM: c.originM,
    recordedA,
    recordedB,
    recordedDifferenceS:
      finite(recordedA) && finite(recordedB) ? recordedB - recordedA : null,
    commonEndM: last >= 0 ? c.distanceM[last] : null,
    commonEndDeltaS: last >= 0 ? c.deltaS[last] : null,
    channels,
    mapping: {
      intervals: mappings[b].intervals.length,
      reason: mappings[b].reason,
      startM: mappings[b].intervals[0]?.startM ?? null,
      startS: mappings[b].intervals[0]?.startS ?? null,
      endS: mappings[b].intervals.at(-1)?.endS ?? null,
    },
    policy: { ...c.policy },
    metrics: {
      comparisonMs: nullable(result.comparisonMs),
      gridPayloadBytes: arrays.reduce((sum, v) => sum + v.byteLength, 0),
      profileSamples: profileA.samples.length + profileB.samples.length,
    },
  });
  return {
    summary,
    comparison: c,
    profiles,
    mappings,
    sample,
    series(id, key) {
      return {
        distances: c.distanceM,
        values: series(id, key),
        connections: links(id, key),
      };
    },
    intervalDelta(start, end) {
      if (!(end > start)) return null;
      const first = sample(b, "deltaS", start),
        last = sample(b, "deltaS", end);
      if (first === null || last === null) return null;
      let firstIndex = Math.max(1, lowerBound(c.distanceM, start));
      if (c.distanceM[firstIndex] === start) firstIndex++;
      const lastIndex = lowerBound(c.distanceM, end);
      if (deltaBreaks[lastIndex] - deltaBreaks[firstIndex - 1] > 0) return null;
      return last - first;
    },
  };
}

// Pixel-column min/max envelope: original points, chronological order, breaks never merged.
export function displaySegments(series, start, end, pixels = 1000) {
  if (!(end > start)) return [];
  const { distances: d, values: v, connections } = series;
  const output = [];
  let run = [],
    bucket = null;
  function flushBucket() {
    if (!bucket) return;
    const indices = [
      ...new Set([bucket.first, bucket.min, bucket.max, bucket.last]),
    ].sort((a, b) => a - b);
    for (const i of indices) run.push([d[i], v[i]]);
    bucket = null;
  }
  function flushRun() {
    flushBucket();
    if (run.length) output.push(run);
    run = [];
  }
  const columns = Math.max(1, Math.min(4096, Math.floor(pixels)));
  for (
    let i = Math.max(0, lowerBound(d, start) - 1);
    i < d.length && (d[i] <= end || i === lowerBound(d, end));
    i++
  ) {
    if (!finite(v[i])) {
      flushRun();
      continue;
    }
    if (i && !connections[i]) flushRun();
    const column = Math.floor(((d[i] - start) / (end - start)) * columns);
    if (!bucket || bucket.column !== column) {
      flushBucket();
      bucket = { column, first: i, last: i, min: i, max: i };
    }
    bucket.last = i;
    if (v[i] < v[bucket.min]) bucket.min = i;
    if (v[i] > v[bucket.max]) bucket.max = i;
  }
  flushRun();
  return output;
}
