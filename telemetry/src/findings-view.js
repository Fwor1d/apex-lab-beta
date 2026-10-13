/** Presentation only: never changes analytical evidence or the reference engine. */
const finite = Number.isFinite;
export const FINDING_TITLES = {
  "time-region": "Где изменилось время",
  "braking-point": "Начало торможения",
  "speed-minimum": "Минимум наблюдаемой скорости",
  "minimum-speed": "Минимум наблюдаемой скорости",
  "throttle-pickup": "Открытие газа",
  "brake-release": "Отпускание тормоза",
};
export function findingRange(finding) {
  const range = finding.distanceRangeM;
  if (
    Array.isArray(range) &&
    range.length === 2 &&
    range.every(finite) &&
    range[1] >= range[0]
  )
    return range;
  const a = finding.evidence?.a;
  return finite(a?.startM) && finite(a?.endM) && a.endM >= a.startM
    ? [a.startM, a.endM]
    : null;
}
export function findingPresentation(finding) {
  const hasEvidence =
    finding.evidence && Object.keys(finding.evidence).length > 0;
  const classification =
    !hasEvidence || finding.classification === "insufficient-evidence"
      ? "insufficient"
      : finding.classification === "hypothesis"
        ? "hypothesis"
        : "observation";
  return {
    title: FINDING_TITLES[finding.category] ?? "Наблюдение",
    classification,
    label: {
      observation: "Подтверждённое наблюдение",
      hypothesis: "Поддержанная гипотеза",
      insufficient: "Недостаточно данных",
    }[classification],
    range: findingRange(finding),
    // Only a measured t(distance) change has a defensible local time impact.
    timeImpactS:
      finding.category === "time-region" &&
      finite(finding.estimatedTimeImpactS) &&
      hasEvidence
        ? finding.estimatedTimeImpactS
        : null,
    explanation: (finding.explanation ?? finding.text ?? "").replace(
      "по t(s)",
      "по времени достижения одинаковой дистанции",
    ),
    action:
      finding.action ??
      finding.suggestedAction ??
      "Проверьте исходные сигналы и ограничения записи.",
  };
}
/** Rank measured regions by absolute impact; never add overlapping impacts. */
export function selectPriorityFindings(findings, limit = 3) {
  const ranked = findings
    .map((finding, index) => ({
      finding,
      index,
      view: findingPresentation(finding),
    }))
    .sort((a, b) => {
      const quality = { observation: 2, hypothesis: 1, insufficient: 0 };
      const aq = quality[a.view.classification],
        bq = quality[b.view.classification];
      if (aq !== bq) return bq - aq;
      const at = a.view.timeImpactS,
        bt = b.view.timeImpactS;
      if (at !== null || bt !== null)
        return at === null
          ? 1
          : bt === null
            ? -1
            : Math.abs(bt) - Math.abs(at) || a.index - b.index;
      return a.index - b.index;
    });
  const selected = [];
  for (const entry of ranked) {
    if (selected.length >= Math.max(0, limit)) break;
    if (
      entry.view.timeImpactS !== null &&
      entry.view.range &&
      selected.some(
        (prior) =>
          prior.view.timeImpactS !== null &&
          prior.view.range &&
          Math.max(entry.view.range[0], prior.view.range[0]) <
            Math.min(entry.view.range[1], prior.view.range[1]),
      )
    )
      continue;
    selected.push(entry);
  }
  const selectedIndices = new Set(selected.map((entry) => entry.index));
  return {
    primary: selected.map((entry) => entry.finding),
    remaining: findings.filter((_, index) => !selectedIndices.has(index)),
  };
}
export function recordedComparison(session, a, b) {
  const reference = session.laps.find((lap) => lap.lapId === a),
    current = session.laps.find((lap) => lap.lapId === b);
  const aTimeS = reference?.validation?.recordedTimeS,
    bTimeS = current?.validation?.recordedTimeS;
  return {
    aTimeS: finite(aTimeS) ? aTimeS : null,
    bTimeS: finite(bTimeS) ? bTimeS : null,
    deltaS:
      finite(aTimeS) && finite(bTimeS) && a !== b ? bTimeS - aTimeS : null,
  };
}
/** Do not show database internals, URLs, filenames or local paths in public errors. */
export function friendlyError(message) {
  const text = String(message ?? "");
  if (
    /\/Users\/|[A-Za-z]:\\|file:\/\/|https?:\/\/|SQL|ATTACH|Parser Error|Binder Error|IO Error|SyntaxError|JSON\.parse|Unexpected token/i.test(
      text,
    )
  )
    return "Файл не удалось прочитать. Проверьте формат и целостность записи; выберите другой файл. Предыдущий успешный анализ сохранён.";
  return text.length > 400
    ? "Не удалось обработать файл. Выберите поддерживаемую запись или повторите попытку."
    : text || "Не удалось обработать файл. Повторите открытие.";
}
