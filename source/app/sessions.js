// Presentation only. Imported strings are escaped at every HTML boundary.
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const show = (value) =>
  value === null || value === undefined || value === ""
    ? "Не установлено"
    : escapeHTML(value);
const number = (n, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("ru-RU", { maximumFractionDigits: digits })
    : "Нет данных";
const seconds = (n) =>
  Number.isFinite(n) ? number(n, 3) + " с" : "Нет данных";
const yes = (v) => (v === true ? "Да" : v === false ? "Нет" : "Не установлено");
const eligible = (d, l) =>
  d.comparisonAllowed &&
  l.eligible &&
  l.certified_valid &&
  l.source_verified &&
  l.kind === "telemetry-derived" &&
  l.validation.pit === false;
export const isImportBusy = (status) =>
  ["validating", "importing"].includes(status.phase);
export function importStatusHTML(status) {
  if (status.phase === "idle") return "";
  return `<div class="import-status ${status.phase === "failed" ? "import-error" : ""}" role="status" data-import-state="${escapeHTML(status.phase)}">${isImportBusy(status) ? '<progress aria-label="Обработка локальной записи"></progress>' : ""}<p>${escapeHTML(status.message)}</p>${status.phase === "partial" ? "<p>Импорт завершён с ограничениями: часть каналов или профили кругов недоступны. Подробности ниже.</p>" : ""}</div>`;
}
function metadataHTML(d) {
  const m = d.metadata;
  return `<dl class="session-metadata">${[
    ["Трасса", m.track],
    ["Конфигурация", m.layout],
    ["CarName · имя записи / ливреи", m.car],
    ["Класс", m.carClass],
    ["Тип сессии", m.sessionType],
    ["Время записи · UTC", m.recordingUTC],
  ]
    .map(
      ([label, value]) => `<div><dt>${label}</dt><dd>${show(value)}</dd></div>`,
    )
    .join("")}</dl>`;
}
export function realPairHTML(state) {
  const d = state.source,
    laps = d.laps.filter((l) => eligible(d, l));
  if (laps.length < 2)
    return `<section class="real-pair"><h2>Пара A/B недоступна</h2><p>${laps.length ? "Рабочему фильтру соответствует один круг. Для пары нужны два разных подходящих круга из этой записи." : "В этой записи нет двух кругов, прошедших рабочий фильтр. Все найденные сегменты можно просмотреть ниже."}</p></section>`;
  const options = (key) =>
    laps
      .map(
        (l) =>
          `<option value="${escapeHTML(l.id)}" ${state[key] === l.id ? "selected" : ""} ${state[key === "a" ? "b" : "a"] === l.id ? "disabled" : ""}>${escapeHTML(l.label)} · ${seconds(l.validation.recordedTimeS)}</option>`,
      )
      .join("");
  return `<section class="real-pair"><h2>Выбрать пару A/B</h2><div class="pair-strip"><label class="field a"><span>A · базовый круг</span><select id="real-lap-a">${options("a")}</select></label><label class="field b"><span>B · разбираемый круг</span><select id="real-lap-b">${options("b")}</select></label></div><button id="swap-real-pair">Поменять A и B</button><p>Пара сохранена в контексте этой записи. Графики и дельта будут подключены на следующем этапе.</p></section>`;
}
function lapDetails(lap) {
  if (!lap)
    return "<p>Импортёр не сформировал профили кругов. Посмотрите предупреждения и доступность каналов.</p>";
  const v = lap.validation;
  return `<dl class="session-metadata compact">${[
    ["Рабочий фильтр", yes(v.eligible)],
    ["Пит-переезд", yes(v.pit)],
    ["Завершённый сегмент", yes(v.completed)],
    ["Последовательность Lap", yes(v.lapSequenceContinuous)],
    ["Согласование времени", yes(v.timingAgreement)],
    ["Записанный Lap Time", seconds(v.recordedTimeS)],
    ["Длительность между границами", seconds(v.boundaryDurationS)],
    ["Начало Lap Dist", number(v.distanceStartM, 2) + " м"],
    ["Конец Lap Dist", number(v.distanceEndM, 2) + " м"],
    ["Пропуски Lap Dist", number(v.missingDistanceSamples)],
    ["Регрессии Lap Dist", number(v.distanceRegressions)],
  ]
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join(
      "",
    )}</dl><p class="notice">${show(lap.status)}. Рабочий фильтр не является независимой спортивной сертификацией LMU. Отсутствие данных не означает нулевое значение.</p>`;
}
const channelNames = {
  timeS: "Время",
  distanceM: "Дистанция",
  speedMps: "Скорость",
  brake: "Тормоз",
  throttle: "Газ",
  steeringNormalized: "Руль",
};
const availability = {
  available: "Доступен",
  partial: "С пропусками",
  unavailable: "Нет данных",
};
function channelsHTML(d) {
  return `<details class="session-details"><summary>Каналы и единицы</summary><p>Наличие таблицы и нормализация проверены отдельно. Графики этого интерфейса пока не подключены.</p><div class="session-table-scroll" tabindex="0" aria-label="Каталог основных каналов"><table class="data-table"><thead><tr><th scope="col">Канал</th><th scope="col">Источник</th><th scope="col">Нормализация</th><th scope="col">Единицы</th></tr></thead><tbody>${d.channels.map((c) => `<tr><th scope="row">${channelNames[c.id]}</th><td>${availability[c.rawStatus]}</td><td>${availability[c.normalizedStatus]}</td><td>${show(c.sourceUnit)} → ${show(c.unit)}</td></tr>`).join("")}</tbody></table></div><p>Руль — нормированный ввод со знаком, не угол колёс. Частотная привязка value-only каналов имеет ограничения импортёра.</p></details>`;
}
export function recordingDetailsHTML(state) {
  const d = state.source;
  if (!d.id)
    return '<section class="empty"><h2>Локальная запись ещё не открыта</h2><p>Выберите .duckdb или откройте демонстрационный заезд.</p></section>';
  const laps = d.laps,
    count = laps.filter((l) => eligible(d, l)).length;
  return `<article class="panel imported-session" data-session-id="${escapeHTML(d.id)}"><div class="section-head"><h2>${show(d.metadata.track)}</h2><span class="tag">${d.kind === "synthetic" ? "ТЕСТ · синтетическая база" : "REAL · локальная запись"}</span></div>${metadataHTML(d)}<p class="session-count"><strong>${laps.length}</strong> сегментов · <strong>${count}</strong> для пары по рабочему фильтру</p>${realPairHTML(state)}<section class="real-laps"><h2>Все обнаруженные круги</h2>${laps.length ? `<div class="lap-inventory">${laps.map((l) => `<div class="lap-row" data-lap-id="${escapeHTML(l.id)}" data-eligible="${!!eligible(d, l)}"><strong>${escapeHTML(l.label)}</strong><span>${seconds(l.validation.recordedTimeS)}</span><span>${show(l.status)}</span><button data-inspect-lap="${escapeHTML(l.id)}" aria-pressed="${state.selectedLapId === l.id}">Подробности</button></div>`).join("")}</div><section class="lap-details" id="lap-details" tabindex="-1" aria-labelledby="lap-details-title"><h3 id="lap-details-title">${show(laps.find((l) => l.id === state.selectedLapId)?.label)} · проверки импортёра</h3>${lapDetails(laps.find((l) => l.id === state.selectedLapId))}</section>` : lapDetails(null)}</section>${channelsHTML(d)}<details class="session-details"><summary>Предупреждения импортёра (${d.warnings.length})</summary><ul>${d.warnings.map((w) => `<li>${escapeHTML(w)}</li>`).join("")}</ul></details><details class="session-details"><summary>Источник и границы достоверности</summary><dl class="cap-list"><dt>Session ID</dt><dd>${show(d.session.id)}</dd><dt>Recording ID · SHA-256 файла</dt><dd>${show(d.recording.id)}</dd><dt>Источник</dt><dd>Локальный файл · LMU Version 1</dd><dt>Хранение</dt><dd>Память вкладки · без сохранения базы</dd></dl><p>SHA-256 задаёт идентичность выбранных байтов, а не доказывает их подлинность. CarName не подтверждает модель автомобиля. Движок DuckDB освобождён; нормализованные профили остаются в изолированном Worker до закрытия записи.</p></details></article>`;
}
export function realSessionsHTML(state) {
  return `<div class="page-title"><div><h1>Сессии</h1><p>Локальная запись → качество → выбор кругов.</p></div><button class="primary" data-action="import">Выбрать .duckdb</button></div><div class="real-source-bar"><span>${state.source.kind === "synthetic" ? "Синтетическая тестовая база · не настоящая телеметрия" : "REAL · выбран локальный источник"}</span><button data-action="use-demo">Открыть DEMO</button>${state.loaded ? '<button data-action="release-recording">Закрыть запись</button>' : ""}</div>${importStatusHTML(state.importStatus)}${isImportBusy(state.importStatus) ? '<button data-action="cancel-import">Отменить импорт</button>' : ""}${["failed", "cancelled"].includes(state.importStatus.phase) && state.importStatus.stage !== "released" ? '<button data-action="retry-import">Повторить импорт</button>' : ""}${recordingDetailsHTML(state)}<p class="notice">Запись читается в браузере и не отправляется на сервер. После закрытия вкладки её нужно выбрать заново.</p>`;
}
const routeNames = {
  dashboard: "Рабочий стол",
  telemetry: "Телеметрия",
  atlas: "Атлас трасс",
  lab: "Driving Lab",
  reports: "Отчёты",
};
export function realRouteHTML(state) {
  const titles = {
    dashboard: "Запись доступна в разделе «Сессии»",
    telemetry: "Реальный анализ ещё не подключён",
    atlas: "Привязка записи к карте недоступна",
    lab: "Записанный контекст Driving Lab недоступен",
    reports: "Экспорт реального отчёта ещё не подключён",
  };
  return `<div class="page-title"><div><h1>${routeNames[state.route]}</h1><p>${state.source.kind === "synthetic" ? "Тестовый локальный файл · синтетические данные" : "REAL · локальный источник"}</p></div><button data-action="import">Выбрать .duckdb</button></div>${importStatusHTML(state.importStatus)}${
    state.route === "telemetry"
      ? '<div class="tabs" role="group" aria-label="Режим телеметрии">' +
        [
          ["overview", "Обзор"],
          ["map", "Карта"],
          ["pitwall", "Pit Wall"],
          ["advanced", "Аналитика"],
          ["setup", "Setup"],
        ]
          .map(
            ([id, name]) =>
              `<button data-mode="${id}" aria-pressed="${state.mode === id}">${name}</button>`,
          )
          .join("") +
        "</div>"
      : ""
  }<section class="panel real-unavailable"><h2>${state.loaded ? titles[state.route] : "Локальная запись не открыта"}</h2><p>${state.loaded ? "Импортированы метаданные и список кругов. Реальные сигналы, дельта, playback, траектории, события, советы, сектора и экспорт в этом интерфейсе пока недоступны." : "Выберите файл .duckdb, чтобы увидеть его метаданные и круги."}</p>${state.pair ? `<p>Выбрана пара: A · круг ${escapeHTML(state.a)} / B · круг ${escapeHTML(state.b)}. Анализ ещё не выполнен.</p>` : ""}<div class="row"><a href="#sessions">Открыть сессии и круги</a><button data-action="use-demo">Переключиться на DEMO</button></div></section>`;
}
