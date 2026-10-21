// Portable contract for future local adapters. No file access or network operations.
export const PROFILE_SCHEMA_VERSION = "1.0.0";
export const CHANNEL_UNITS = Object.freeze({
  timeS: "s",
  distanceM: "m",
  speedMps: "m/s",
  brake: "ratio",
  throttle: "ratio",
  steeringNormalized: "ratio-signed",
  roadWheelAngleRad: "rad",
  positionXM: "m",
  positionYM: "m",
  lateralAccelerationMps2: "m/s2",
  longitudinalAccelerationMps2: "m/s2",
});
const validId = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 200;
const fail = (message) => {
  throw new Error(`Профиль: ${message}`);
};
export function validatePortableProfile(profile) {
  if (!profile || profile.schemaVersion !== PROFILE_SCHEMA_VERSION)
    fail("неподдерживаемая версия");
  if (!["educational", "synthetic", "telemetry-derived"].includes(profile.kind))
    fail("неизвестное происхождение");
  for (const key of ["carId", "circuitId", "layoutId"])
    if (!validId(profile.context?.[key])) fail(`нет ${key}`);
  if (!validId(profile.provenance?.sourceId)) fail("нет источника");
  if (
    profile.kind === "telemetry-derived" &&
    (!validId(profile.provenance.sessionId) ||
      !validId(profile.provenance.lapId) ||
      !/^[a-f0-9]{64}$/i.test(profile.provenance.sha256 ?? ""))
  )
    fail("нужны сессия, круг и SHA-256 реального файла");
  if (
    profile.kind === "educational" &&
    !validId(profile.provenance.modelVersion)
  )
    fail("нет версии модели");
  if (profile.kind === "synthetic" && !validId(profile.provenance.fixtureLabel))
    fail("нет обозначения синтетического примера");
  const channels = profile.channels;
  if (
    !channels ||
    typeof channels !== "object" ||
    Array.isArray(channels) ||
    !Object.keys(channels).length
  )
    fail("нет описания каналов");
  for (const [key, channel] of Object.entries(channels)) {
    if (
      !channel ||
      typeof channel !== "object" ||
      Array.isArray(channel) ||
      !Object.hasOwn(CHANNEL_UNITS, key) ||
      channel.unit !== CHANNEL_UNITS[key]
    )
      fail(`неизвестный канал или единица ${key}`);
    if (
      !["measured", "derived", "model", "synthetic", "missing"].includes(
        channel.status,
      )
    )
      fail(`неизвестный статус ${key}`);
    if (
      profile.kind === "educational" &&
      !["model", "missing"].includes(channel.status)
    )
      fail("измерения не смешиваются с моделью");
    if (
      profile.kind === "synthetic" &&
      !["synthetic", "missing"].includes(channel.status)
    )
      fail("неверный канал синтетического примера");
    if (
      profile.kind === "telemetry-derived" &&
      ["model", "synthetic"].includes(channel.status)
    )
      fail("синтетический канал в телеметрии");
    if (channel.status === "measured" && !validId(channel.sourceChannel))
      fail(`нет исходного канала ${key}`);
    if (
      channel.status === "derived" &&
      (!validId(channel.method) ||
        !Array.isArray(channel.inputs) ||
        !channel.inputs.length ||
        channel.inputs.some((input) => channels[input]?.status !== "measured"))
    )
      fail(`необоснованное вычисление ${key}`);
  }
  if (
    !Array.isArray(profile.samples) ||
    profile.samples.length < 2 ||
    profile.samples.length > 200000
  )
    fail("неподдерживаемое число отсчётов");
  let distance = -Infinity,
    time = -Infinity;
  for (const sample of profile.samples) {
    if (!sample || typeof sample !== "object") fail("повреждённый отсчёт");
    for (const [key, value] of Object.entries(sample))
      if (
        !Object.hasOwn(channels, key) ||
        (value !== null && !Number.isFinite(value))
      )
        fail(`неописанный или нечисловой канал ${key}`);
    for (const [key, channel] of Object.entries(channels)) {
      if (!Object.hasOwn(sample, key))
        fail(`отсутствует поле ${key}; пропуск задаётся null`);
      const value = sample[key];
      if (channel.status === "missing" && value !== null)
        fail(`выдуманный отсутствующий канал ${key}`);
      if (value === null) continue;
      if (["timeS", "distanceM", "speedMps"].includes(key) && value < 0)
        fail(`отрицательное значение ${key}`);
      if (["brake", "throttle"].includes(key) && (value < 0 || value > 1))
        fail(`неверный диапазон ${key}`);
      if (key === "steeringNormalized" && Math.abs(value) > 1)
        fail("неверная нормализация руля");
      if (key === "distanceM") {
        if (value < distance) fail("расстояние должно возрастать внутри круга");
        distance = value;
      }
      if (key === "timeS") {
        if (value <= time) fail("время должно строго возрастать");
        time = value;
      }
    }
  }
  if (
    (channels.positionXM || channels.positionYM) &&
    (!channels.positionXM ||
      !channels.positionYM ||
      !validId(profile.positionReference?.crs) ||
      !validId(profile.positionReference?.origin))
  )
    fail("нет системы координат или пары положения");
  return profile;
}
export function referenceCompatibility(profile, context) {
  validatePortableProfile(profile);
  const mismatches = ["carId", "circuitId", "layoutId"].filter(
    (key) => profile.context[key] !== context[key],
  );
  const required = ["timeS", "distanceM", "speedMps", "brake", "throttle"];
  const absent = required.filter(
    (key) => !["measured", "derived"].includes(profile.channels[key]?.status),
  );
  const gaps = required.filter((key) =>
    profile.samples.some((sample) => sample[key] === null),
  );
  return {
    compatible:
      profile.kind === "telemetry-derived" &&
      mismatches.length === 0 &&
      absent.length === 0 &&
      gaps.length === 0,
    mismatches,
    absent,
    gaps,
    kind: profile.kind,
  };
}
export function educationalPortableProfile(drivingProfile, context) {
  const keys = [
    "distanceM",
    "speedMps",
    "brake",
    "throttle",
    "steeringNormalized",
  ];
  return validatePortableProfile({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    kind: "educational",
    context,
    provenance: {
      sourceId: "apex-educational-model",
      modelVersion: drivingProfile.modelVersion,
      assumptions: {
        ...drivingProfile.assumptions,
        gripG: drivingProfile.settings.grip,
      },
      settings: { ...drivingProfile.settings },
      reachableDistanceM:
        (drivingProfile.stopProgress ?? 1) * drivingProfile.lengthM,
      geometryStatus: drivingProfile.geometryStatus,
      distanceBasis: "approximate-centerline",
    },
    channels: Object.fromEntries(
      keys.map((key) => [key, { unit: CHANNEL_UNITS[key], status: "model" }]),
    ),
    samples: drivingProfile.samples.map((s) => ({
      distanceM: s.progress * drivingProfile.lengthM,
      speedMps: s.speed / 3.6,
      brake: s.brake / 100,
      throttle: s.throttle / 100,
      steeringNormalized: s.steering / 100,
    })),
  });
}
