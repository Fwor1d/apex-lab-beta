import { getDrivingProfile, sampleProfile } from "./driving-profile.js";
export {
  APEX_PROGRESS,
  apexProgress,
  linePoint,
  vehiclePose,
} from "./trajectory.js";
export { brakeAt, throttleAt, getDrivingProfile } from "./driving-profile.js";
export const signalsAt = (progress, corner, settings) =>
  sampleProfile(getDrivingProfile(corner, settings), progress);
const severity = (level) => ({ green: 0, yellow: 1, red: 2 })[level];
export function evaluate(corner, settings) {
  const profile = getDrivingProfile(corner, settings),
    m = profile.metrics;
  const gap = m.achievedApexSpeed - m.targetApexSpeed;
  const insufficient = m.minimumDistanceM > m.availableDistanceM;
  const brakingLevel =
    profile.stopProgress !== null ||
    insufficient ||
    m.targetApexDemand > 1.02 ||
    gap > 12
      ? "red"
      : Math.abs(gap) > 5
        ? "yellow"
        : "green";
  const brakingText =
    profile.stopProgress !== null
      ? "Модель останавливается до выхода. Уменьши давление или длительность торможения; недостижимая часть линии показана только для изучения."
      : insufficient
        ? "До апекса меньше расстояния, чем нужно даже при постоянном предельном замедлении по прямой. Начни раньше или снизь скорость входа."
        : m.targetApexDemand > 1.02
          ? "Целевая скорость требует больше принятого сцепления в апексе. Снизь цель: уменьшение тормоза ради этой скорости не сделает линию достижимой."
          : gap > 5
            ? `В апексе модель на ${Math.round(gap)} км/ч выше цели. Начни тормозить раньше или увеличь давление; дополнительный руль не добавляет сцепления.`
            : gap < -5
              ? `Модель на ${Math.round(-gap)} км/ч ниже цели. Проверь длительность и давление тормоза; цель сама по себе не изменяет скорость.`
              : "Скорость достигается действием педалей, а не подгонкой к цели. Запас расстояния рассчитан по приближённой линии OSM.";
  const combinedOnTurn = profile.samples.some(
    (s) => s.lateralDemand > 0.35 && s.gripDemand > 1.05,
  );
  const gripLevel =
    m.peakLateralDemand > 1.02
      ? "red"
      : m.peakLateralDemand > 0.9 || combinedOnTurn
        ? "yellow"
        : "green";
  const gripText =
    m.peakLateralDemand > 1.02
      ? "Для заданной линии не хватает принятого сцепления. Риск сноса передней оси: снизь скорость до дуги. Машина показывает запланированную линию, а не физически достижимый занос."
      : combinedOnTurn
        ? "Тормоз и поворот требуют больше принятого запаса. Плавнее отпускай тормоз с ростом руля. Условное ограничение ABS не создаёт дополнительного сцепления."
        : m.peakLateralDemand > 0.9
          ? "На дуге небольшой запас по принятой модели. Избегай резкого тормоза и газа; величина зависит от приблизительной кривизны и допущения сцепления."
          : "В принятых допущениях остаётся запас на дуге. Это не проверка шин, аэродинамики или сцепления LMU.";
  const exitSamples = profile.samples.filter(
    (s) => s.progress >= settings.gasStart / 100,
  );
  const tc = exitSamples.some((s) => s.tcDemand > 0 && s.lateralDemand > 0.7);
  const abrupt =
    settings.gasRamp < 20 &&
    exitSamples.some((s) => s.throttle > 20 && s.lateralDemand > 0.7);
  const exitLevel =
    m.overlap > 6 ? "red" : m.overlap > 2 || tc || abrupt ? "yellow" : "green";
  const exitText =
    m.overlap > 2
      ? "Газ открывается до завершения торможения. Перенеси открытие газа или сократи отпускание; перекрытие требует отдельного обоснования реальной телеметрией."
      : tc || abrupt
        ? "Газ при ещё большой нагрузке на дуге повышает учебный индикатор риска потери заднего сцепления. Открывай плавнее по мере распрямления руля. TC ограничивает тягу, а не увеличивает сцепление."
        : "Газ нарастает без заметного перекрытия педалей. Сравни его рост с уменьшением руля; реальная работа TC здесь не воспроизводится.";
  const checks = [
    { label: "Торможение и цель", level: brakingLevel, text: brakingText },
    { label: "Поворот и сцепление", level: gripLevel, text: gripText },
    { label: "Газ и баланс", level: exitLevel, text: exitText },
  ].map((c) => ({ ...c, error: severity(c.level) }));
  const level = checks.reduce(
    (a, c) => (severity(c.level) > severity(a) ? c.level : a),
    "green",
  );
  return {
    level,
    checks,
    metrics: m,
    stopProgress: profile.stopProgress,
    overlap: m.overlap,
    title: {
      green: "Согласовано с допущениями",
      yellow: "Проверь запас и плавность",
      red: "Сочетание требует изменения",
    }[level],
  };
}
const phases = [
  [
    "approach",
    "Подход",
    "Подготовь ориентир и смотри на выход. До торможения модель удерживает заданную скорость; это граничное условие, не расчёт двигателя.",
  ],
  [
    "braking",
    "Торможение",
    "Основное замедление выполняй до дуги. Чем выше входная скорость, тем больше энергии нужно погасить: тормозной путь растёт с квадратом скорости.",
  ],
  [
    "turn-in",
    "Начало поворота",
    "Начинай поворот плавно. С ростом поперечной нагрузки уменьшается запас для торможения — дополнительный руль не возвращает потерянное сцепление.",
  ],
  [
    "trail",
    "Дотормаживание",
    "Дотормаживание (trail braking): уменьшай давление тормоза по мере добавления руля. Остаточное торможение помогает управлять входом, но общий запас сцепления ограничен.",
  ],
  [
    "apex",
    "Апекс",
    "Сравни рассчитанную скорость с целью. Положение апекса — учебная отметка; линия OSM не подтверждает реальный клиппинг или границы трассы.",
  ],
  [
    "pickup",
    "Открытие газа",
    "Наращивай газ вместе с распрямлением руля. Резкая тяга на дуге может снизить запас заднего сцепления; индикатор TC здесь только концептуальный.",
  ],
  [
    "exit",
    "Выход",
    "Продолжай распрямлять руль и увеличивать газ. Скорость выхода получена из ускорения модели, а не задана готовым числом. Проверь технику по реальной записи.",
  ],
];
export function phaseMilestones(corner, settings) {
  const p = getDrivingProfile(corner, settings),
    start = settings.brakeStart / 100;
  const turn = Math.max(
    start + 0.04,
    Math.min(p.turnInProgress, p.apexProgress - 0.08),
  );
  const positions = [
    0,
    start + 0.04,
    turn,
    Math.min(p.apexProgress - 0.03, turn + 0.05),
    p.apexProgress,
    settings.gasStart / 100 + 0.03,
    Math.min(1, (settings.gasStart + settings.gasRamp) / 100),
  ];
  return phases.map(([id, title, text], i) => ({
    id,
    title,
    text,
    progress: positions[i],
  }));
}
export function phaseAt(progress, corner, settings) {
  const profile = getDrivingProfile(corner, settings),
    s = sampleProfile(profile, progress),
    milestones = phaseMilestones(corner, settings);
  let index;
  if (progress < settings.brakeStart / 100) index = 0;
  else if (Math.abs(progress - profile.apexProgress) <= 0.025) index = 4;
  else if (progress >= settings.gasStart / 100) index = s.throttle < 99 ? 5 : 6;
  else if (
    progress >= milestones[2].progress &&
    progress < milestones[2].progress + 0.04
  )
    index = 2;
  else if (progress >= milestones[2].progress && s.brake > 1) index = 3;
  else if (progress > profile.apexProgress || s.brake <= 1) index = 4;
  else index = 1;
  const phase = { ...milestones[index] };
  if (profile.stopProgress !== null && progress >= profile.stopProgress)
    phase.text =
      "Эта точка недостижима: модель уже остановилась. Уменьши давление или длительность торможения либо верни учебный пример. Перемотка позволяет изучить планируемые действия.";
  return phase;
}
