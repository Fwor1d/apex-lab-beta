/** Presentation only. Analytical results are computed in the Worker. */
const titles = {
  "time-region": "Где изменилось время",
  "incident-review": "Участок для проверки по повтору",
  "brake-onset": "Начало торможения",
  "braking-point": "Начало торможения",
  "brake-peak": "Команда тормоза",
  "brake-duration": "Продолжительность торможения",
  "progressive-release": "Отпускание тормоза",
  "steering-overlap": "Совместный ввод тормоза и руля",
  "pedal-overlap": "Перекрытие педалей",
  "speed-minimum": "Минимум наблюдаемой скорости",
  "entry-speed": "Скорость при начале торможения",
  "recovery-speed": "Восстановление скорости",
  "sustained-throttle": "Устойчивое открытие газа",
  "low-throttle": "Движение с малым газом",
  "exit-acceleration": "Среднее ускорение после отпускания тормоза",
  "steering-activity": "Активность руля",
};
const $ = (id) => document.getElementById(id);
const number = (v, digits = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("ru-RU", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      })
    : "нет данных";
const metrics = {
  "time-region": [
    ["minSpeedMps", "Минимум скорости", "км/ч", 3.6],
    ["maxAbsSteering", "Максимум модуля ввода руля", "%", 100],
  ],
  "brake-onset": [["startM", "Начало тормоза", "м", 1]],
  "brake-peak": [["peakBrake", "Максимум команды тормоза", "%", 100]],
  "brake-duration": [["brakeDurationS", "Торможение", "с", 1]],
  "progressive-release": [
    ["releaseDurationS", "Отпускание от первого максимума", "с", 1],
  ],
  "pedal-overlap": [["pedalOverlapS", "Перекрытие педалей", "с", 1]],
  "steering-overlap": [
    ["steeringOverlapS", "Тормоз ≥10% и |руль| ≥10%", "с", 1],
  ],
  "entry-speed": [
    ["entrySpeedMps", "Скорость при начале тормоза", "км/ч", 3.6],
  ],
  "speed-minimum": [["minSpeedMps", "Минимум скорости", "км/ч", 3.6]],
  "recovery-speed": [
    ["recoverySpeedMps", "Скорость на конце окна выхода", "км/ч", 3.6],
  ],
  "sustained-throttle": [
    ["sustainedThrottleM", "Начало устойчивого газа ≥20%", "м", 1],
  ],
  "low-throttle": [
    ["lowThrottleS", "После отпускания тормоза с газом <20%", "с", 1],
  ],
  "exit-acceleration": [
    [
      "exitAccelerationMps2",
      "Среднее ускорение после отпускания тормоза",
      "м/с²",
      1,
    ],
  ],
  "steering-activity": [
    ["steeringCorrections", "Смены направления ввода", "раз", 1],
  ],
};
function evidenceSummary(f) {
  return (metrics[f.category] ?? [])
    .map(
      ([key, label, unit, factor]) =>
        `${label}: A ${number(Number.isFinite(f.measured?.a?.[key]) ? f.measured.a[key] * factor : null)} / B ${number(Number.isFinite(f.measured?.b?.[key]) ? f.measured.b[key] * factor : null)} ${unit}.`,
    )
    .join(" ");
}
function paragraph(text, className = "") {
  const p = document.createElement("p");
  p.textContent = text;
  p.className = className;
  return p;
}
function details(title, data) {
  const d = document.createElement("details"),
    s = document.createElement("summary"),
    pre = document.createElement("pre");
  s.textContent = title;
  pre.textContent = JSON.stringify(data, null, 2);
  d.append(s, pre);
  return d;
}
function explanationDetails(title, explanations, technical) {
  const d = document.createElement("details"),
    s = document.createElement("summary");
  s.textContent = title;
  d.append(s);
  for (const explanation of explanations ?? [])
    if (typeof explanation === "string") d.append(paragraph(explanation));
  d.append(details("Технические основания", technical));
  return d;
}
export class CoachingView {
  constructor(onInvestigate) {
    this.onInvestigate = onInvestigate;
    this.coaching = null;
    $("coaching-mode").addEventListener("change", () =>
      this.render(this.coaching, this.synthetic),
    );
    $("investigation-back").addEventListener("click", () => {
      $("investigation").hidden = true;
      $("coaching-main").scrollIntoView({ block: "start" });
      (this.lastButton?.isConnected
        ? this.lastButton
        : $("coaching-mode")
      ).focus({ preventScroll: true });
    });
  }
  clear() {
    this.coaching = null;
    $("investigation").hidden = true;
    $("coach-summary").textContent = "";
    $("coach-withheld").replaceChildren();
    $("coaching-mode").value = "all";
  }
  render(coaching, synthetic = false) {
    this.coaching = coaching;
    this.synthetic = synthetic;
    $("findings").replaceChildren();
    $("investigation").hidden = true;
    if (!coaching) return;
    const findings = coaching.findings ?? [],
      incident = $("coaching-mode").value === "incident";
    const pool = incident
      ? findings.filter((f) => f.diagnosticMode === "incident-review")
      : findings;
    const sorted = [...pool].sort((a, b) => {
      const ta = Number.isFinite(a.timeImpactS) ? Math.abs(a.timeImpactS) : 0,
        tb = Number.isFinite(b.timeImpactS) ? Math.abs(b.timeImpactS) : 0;
      return (
        tb - ta ||
        (a.classification === "inconclusive") -
          (b.classification === "inconclusive")
      );
    });
    const primary = sorted.slice(0, 3),
      primaryIds = new Set(primary.map((f) => f.id));
    $("coach-summary").textContent =
      coaching.mode === "self-view"
        ? "Открыт один круг: сравнительных рекомендаций нет."
        : "Числа показывают различие действий и времени. Причина потери и прогноз улучшения не установлены. Руль — нормированный ввод, не угол дорожных колёс.";
    $("findings-empty").textContent = primary.length
      ? "Сначала — участки изменения времени и проверяемые наблюдения. Потеря участка учитывается один раз; она не приписывается целиком тормозу или газу."
      : incident
        ? "По доступным каналам нет участка, прошедшего условия проверки по повтору. Это не доказывает отсутствия происшествий."
        : "Недостаточно данных для сравнительного совета. Исследуйте доступные графики.";
    for (const f of primary) $("findings").append(this.card(f));
    const remaining = pool.filter((f) => !primaryIds.has(f.id));
    if (remaining.length) {
      const d = document.createElement("details"),
        s = document.createElement("summary"),
        list = document.createElement("ol");
      s.textContent = `Все остальные наблюдения: ${remaining.length}`;
      const groups = new Map();
      for (const f of remaining) {
        if (!groups.has(f.category)) groups.set(f.category, []);
        groups.get(f.category).push(f);
      }
      for (const [category, entries] of groups) {
        const item = document.createElement("li"),
          group = document.createElement("details"),
          heading = document.createElement("summary"),
          rows = document.createElement("ol");
        heading.textContent = `${titles[category] ?? "Различие в действиях"}: ${entries.length}`;
        group.dataset.findingCategory = category;
        for (const f of entries) rows.append(this.card(f, true));
        group.append(heading, rows);
        item.append(group);
        list.append(item);
      }
      d.append(s, list);
      $("findings").append(d);
    }
    $("coach-withheld").replaceChildren();
    const consistency = coaching.consistency;
    if (consistency)
      $("coach-withheld").append(
        paragraph(
          consistency.explanation ??
            consistency.message ??
            "Для оценки повторяемости нужны минимум три сопоставимых подходящих круга. Один-два круга не подтверждают устойчивый паттерн.",
          "muted",
        ),
      );
    if (coaching.withheld?.length)
      $("coach-withheld").append(
        explanationDetails(
          "Какие диагнозы недоступны и почему",
          coaching.withheld.map((item) => item.explanation),
          coaching.withheld,
        ),
      );
    $("coach-withheld").append(
      explanationDetails(
        "Политика, пороги и качество оснований",
        [
          "Пороговые правила помогают сопоставить действия. Они не задают оптимальные скорости, сцепление или причину происшествия.",
          "Пропуски и неопределённая привязка ограничивают вывод. Изменение времени участка не приписывается целиком одной педали.",
          "Для проверки откройте участок на графиках и сопоставьте повтор. Точные пороги и источники доступны ниже.",
        ],
        {
          schemaVersion: coaching.schemaVersion,
          policy: coaching.policy,
          sections: coaching.sections,
        },
      ),
    );
  }
  card(f, compact = false) {
    const li = document.createElement("li");
    li.className = "coaching-finding";
    li.dataset.findingId = f.id;
    const title = document.createElement("strong");
    title.textContent =
      f.diagnosticMode === "incident-review"
        ? titles["incident-review"]
        : (f.title ?? titles[f.category] ?? "Различие в действиях");
    const classification =
      f.classification === "inconclusive"
        ? "Неубедительный результат"
        : f.classification === "hypothesis"
          ? "Возможное объяснение"
          : "Подтверждённое наблюдение";
    const severity =
      f.severity === "priority" ? "В первую очередь" : "Проверить по данным";
    const status = paragraph(
      this.synthetic
        ? "Наблюдение в синтетическом тесте — не реальная поездка"
        : `${classification} · ${severity}`,
      "finding-status",
    );
    li.append(title, status);
    const range = f.distanceRangeM;
    if (range?.every(Number.isFinite))
      li.append(
        paragraph(
          `Где: ${number(range[0], 0)}–${number(range[1], 0)} м`,
          "finding-location",
        ),
      );
    if (Number.isFinite(f.timeImpactS))
      li.append(
        paragraph(
          `Изменение времени B − A: ${f.timeImpactS >= 0 ? "+" : ""}${number(f.timeImpactS, 3)} с. Это измерение участка, не гарантированный резерв улучшения.`,
          "finding-time",
        ),
      );
    li.append(paragraph(f.explanation ?? ""));
    li.append(paragraph(evidenceSummary(f), "finding-evidence"));
    if (f.classification === "inconclusive")
      li.append(
        paragraph(
          `Ориентир неопределённости привязки: ${number(f.uncertainty?.timingDistanceBoundM)} м; это не доверительный интервал.`,
          "muted",
        ),
      );
    if (range?.every(Number.isFinite)) {
      const b = document.createElement("button");
      b.className = "secondary finding-jump";
      b.textContent = `Проверить участок ${number(range[0], 0)}–${number(range[1], 0)} м`;
      b.addEventListener("click", () => {
        this.lastButton = b;
        this.investigate(f);
      });
      li.append(b);
    }
    if (!compact) {
      li.append(
        paragraph(
          `Что попробовать или проверить: ${f.action ?? "проверить исходные сигналы"}`,
        ),
      );
      if (f.followup)
        li.append(paragraph(`Проверка результата: ${f.followup}`, "muted"));
      const related = (this.coaching.sections ?? []).find((s) =>
        s.findingIds?.includes(f.id),
      );
      if (related?.findingIds?.length > 1) {
        const d = document.createElement("details"),
          s = document.createElement("summary");
        s.textContent = "Связанные наблюдения этого участка";
        for (const id of related.findingIds) {
          const child = this.coaching.findings.find((x) => x.id === id);
          if (child && child.id !== f.id)
            d.append(paragraph(child.explanation));
        }
        d.prepend(s);
        li.append(d);
      }
    }
    li.append(
      details(
        "Исходные численные основания: A/B, единицы и неопределённость",
        f,
      ),
    );
    return li;
  }
  investigate(f) {
    $("investigation").hidden = false;
    $("investigation-title").textContent =
      f.diagnosticMode === "incident-review"
        ? titles["incident-review"]
        : (f.title ?? titles[f.category] ?? "Разбор участка");
    $("investigation-notes").replaceChildren(
      paragraph(f.explanation),
      paragraph(evidenceSummary(f), "finding-evidence"),
      paragraph(f.action),
      paragraph(
        f.followup ??
          "Проверьте по повтору; физическая причина не установлена.",
        "muted",
      ),
    );
    $("investigation-evidence").textContent = JSON.stringify(
      {
        lapA: f.lapAId,
        lapB: f.lapBId,
        measured: f.measured,
        uncertainty: f.uncertainty,
        qualityWarnings: f.qualityWarnings,
      },
      null,
      2,
    );
    $("training-link").hidden = !f.trainingTopic;
    if (f.trainingTopic)
      $("training-link").textContent =
        "Учебный тренажёр: техника без переноса этих измерений";
    this.onInvestigate(f);
    $("investigation").scrollIntoView({ block: "start" });
    $("investigation-title").focus({ preventScroll: true });
  }
}
