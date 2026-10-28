// R5.2 presentation for a measured source. No SQL, alignment, clock, or demo fallback.
import { escapeHTML as esc } from "./sessions.js";
import { displaySegments } from "./data/measured-analysis.js";
export const REAL_CHANNELS = {
  speed: ["Скорость", "км/ч", "speedMps", 3.6],
  brake: ["Тормоз", "%", "brake", 100],
  throttle: ["Газ", "%", "throttle", 100],
  steering: ["Нормированный руль", "%", "steeringNormalized", 100],
  delta: ["Δ B − A", "с", "deltaS", 1],
};
const f = (v, digits = 3) =>
  Number.isFinite(v)
    ? v.toLocaleString("ru-RU", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "Нет данных";
const signed = (v) =>
  Number.isFinite(v) ? `${v > 0 ? "+" : ""}${f(v)} с` : "Нет данных";
const lapTime = (v) =>
  Number.isFinite(v)
    ? `${Math.floor(v / 60)}:${(v % 60).toFixed(3).padStart(6, "0")}`
    : "Нет данных";
const output = (id, label) =>
  `<div><span>${label}</span><strong id="${id}"></strong></div>`;
const modes = [
  ["overview", "Обзор"],
  ["map", "Карта"],
  ["pitwall", "Pit Wall"],
  ["advanced", "Аналитика"],
  ["setup", "Setup"],
];
const tabs = (s) =>
  `<div class="tabs" role="group" aria-label="Режим телеметрии">${modes.map(([id, label]) => `<button data-mode="${id}" aria-pressed="${s.mode === id}">${label}</button>`).join("")}</div>`;
function pairHTML(s, source) {
  const options = (role) =>
    s.source.laps
      .filter((l) => source.eligibleForPair(l.id))
      .map(
        (l) =>
          `<option value="${esc(l.id)}" ${s[role] === l.id ? "selected" : ""} ${s[role === "a" ? "b" : "a"] === l.id ? "disabled" : ""}>${esc(l.label)} · ${lapTime(l.validation.recordedTimeS)}</option>`,
      )
      .join("");
  return `<div class="pair-strip real-analysis-pair ${s.pairOpen ? "pair-open" : ""}"><label class="field identity-a"><span>A · базовый круг</span><select id="real-lap-a">${options("a")}</select></label><label class="field identity-b"><span>B · разбираемый круг</span><select id="real-lap-b">${options("b")}</select></label><button id="swap-real-pair">Поменять A и B</button></div>`;
}
function playback(s) {
  const m = s.analysisStatus.mapping,
    bounds = s.analysisStatus.bounds;
  return `<div class="workspace-playback real-playback"><button id="play" data-action="play" aria-pressed="${s.playing}" ${m.startS === null ? "disabled" : ""}>${s.playing ? "Пауза" : "Пуск"}</button><input id="cursor" type="range" min="${bounds[0]}" max="${bounds[1]}" step="any" value="${s.cursorM ?? bounds[0]}" aria-label="Дистанция общего курсора B" ${m.startS === null ? "disabled" : ""}><output id="distance-output"></output><select id="rate" aria-label="Скорость воспроизведения">${[0.5, 1, 2, 4].map((n) => `<option value="${n}" ${s.rate === n ? "selected" : ""}>${n}×</option>`).join("")}</select></div><details class="real-precision" ${s.precisionOpen ? "open" : ""}><summary>Точная перемотка</summary><div class="real-seek-fields"><label class="field"><span>Точная дистанция, м</span><input id="real-distance" type="number" step="any" min="${bounds[0]}" max="${bounds[1]}" value="${s.cursorM ?? ""}"></label><label class="field"><span>Истёкшее время B, с</span><input id="real-time" type="number" step="any" value="${s.playback.timeS ?? ""}"></label><span id="position-time"></span></div><p class="real-seek-feedback" id="real-seek-feedback" role="status">Воспроизведение останавливается на границе непрерывной временной области.</p></details>`;
}
function hudHTML() {
  return `<div class="telemetry-hud real-hud" aria-label="Измеренные значения у общего курсора">${Object.entries(
    REAL_CHANNELS,
  )
    .map(
      ([k, [label, unit]]) =>
        `<div class="hud-metric hud-${k}"><span>${label} <small>${unit}</small></span><strong id="hud-${k}"></strong><output id="hud-ref-${k}"></output></div>`,
    )
    .join("")}</div>`;
}
function comparisonHTML() {
  return `<div class="comparison-readouts">${output("comparison-speed", "Скорость A / B на одной дистанции")}${output("comparison-distance", "Текущая Δ B − A · по дистанции")}${output("comparison-total", "Записанный полный Lap Time · B − A")}</div><p class="alignment-explanation">Положительная Δ: B медленнее A. Отрицательная: B быстрее. Время воспроизведения — измеренное elapsed time B.</p>`;
}
function timingHTML(a) {
  return `<section class="overview-section"><h2>Сравнение времени</h2><table class="overview-table"><thead><tr><th>Измерение</th><th>B − A, с</th></tr></thead><tbody><tr><th>Записанный полный Lap Time<small>Полные времена из событий записи</small></th><td>${signed(a.recordedDifferenceS)}</td></tr><tr><th>Последняя общая валидная дистанция<small>${f(a.commonEndM, 2)} м · начало отсчёта Δ ${f(a.originM, 2)} м</small></th><td id="real-common-delta">${signed(a.commonEndDeltaS)}</td></tr><tr><th>Изменение Δ в выбранном интервале<small id="real-interval-label"></small></th><td id="real-interval-delta"></td></tr></tbody></table><p>Последняя общая точка может быть раньше конца круга. Эти значения не являются взаимозаменяемыми и не складываются.</p></section>`;
}
function qualityHTML(a) {
  return `<section class="overview-context"><h2>Контекст сравнения</h2><dl class="cap-list"><dt>Валидные точки Δ</dt><dd>${f(a.coverage * 100, 1)} %</dd><dt>Общая область Lap Dist</dt><dd>${f(a.bounds[0], 1)}–${f(a.bounds[1], 1)} м</dd><dt>Временная привязка B</dt><dd>${a.mapping.startS === null ? "Недоступна" : a.mapping.intervals === 1 ? "Непрерывная область" : `${a.mapping.intervals} областей · есть разрывы`}</dd><dt>Дельта</dt><dd>${a.plateau ? "Недоступна: плато дистанции" : a.coverage < 1 ? "Частичное покрытие" : a.continuityBreaks > 0 ? "Валидные точки; есть разрывы между ними" : "Общая дистанционная сетка"}</dd></dl><h3>Каналы A / B</h3><dl class="overview-signals">${Object.entries(
    REAL_CHANNELS,
  )
    .filter(([k]) => k !== "delta")
    .map(
      ([k, [label, , key]]) =>
        `<dt>${label}</dt><dd>${["a", "b"].map((r) => `${r.toUpperCase()}: ${{ available: "доступен", partial: "пропуски", unavailable: "нет данных" }[a.channels[key][r]]}`).join(" · ")}</dd>`,
    )
    .join(
      "",
    )}</dl><p>Карта и записанные траектории подключаются отдельно. Географическая привязка, yaw, официальные сектора и причины потери времени здесь не установлены.</p><a href="#sessions">Исходная сессия и проверки качества</a></section>`;
}
function chartsHTML(s) {
  return `<section class="trace-dock real-trace-dock"><div class="traces"><div class="section-head"><h2>Pit Wall · сигналы по дистанции</h2><button data-real-range="full">Весь диапазон</button></div><div class="signal-controls"><label class="field"><span>Основной канал</span><select id="real-channel">${Object.entries(
    REAL_CHANNELS,
  )
    .map(
      ([k, [label]]) =>
        `<option value="${k}" ${s.channel === k ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="popover-control"><span class="control-caption">Показать каналы</span><button data-popover="real-channels" aria-controls="real-channels" aria-expanded="false">Каналы · ${s.signals.length}</button><div id="real-channels" class="compact-popover" role="group" aria-label="Каналы графиков" hidden>${Object.entries(
    REAL_CHANNELS,
  )
    .map(
      ([k, [label]]) =>
        `<label class="check"><input type="checkbox" data-real-signal="${k}" ${s.signals.includes(k) ? "checked" : ""}>${label}</label>`,
    )
    .join(
      "",
    )}</div></div></div><div class="row spread"><div class="series-controls">${["a", "b"].map((r) => `<label class="check identity-${r}"><input id="real-series-${r}" type="checkbox" ${s.series[r] ? "checked" : ""}>${r.toUpperCase()} · ${r === "a" ? "сплошная" : "штриховая"}</label>`).join("")}</div><button data-real-range="zoom">Приблизить курсор</button></div><div class="real-range-tools"><button data-real-range="left" aria-label="Сместить интервал влево">←</button><label class="field"><span>От, м</span><input id="real-range-start" type="number" step="any" value="${s.range[0]}"></label><label class="field"><span>До, м</span><input id="real-range-end" type="number" step="any" value="${s.range[1]}"></label><button data-real-range="right" aria-label="Сместить интервал вправо">→</button></div><div id="plots">${
    s.signals
      .filter((k) => REAL_CHANNELS[k])
      .map(
        (k) =>
          `<section class="chart"><div class="chart-head"><h3>${REAL_CHANNELS[k][0]}, ${REAL_CHANNELS[k][1]}</h3><output id="readout-${k}"></output></div><svg class="plot real-plot" id="plot-${k}" data-channel="${k}" role="img" tabindex="0" aria-label="${REAL_CHANNELS[k][0]} по общей дистанции. Стрелки меняют курсор."></svg></section>`,
      )
      .join("") || "<p>Все каналы скрыты. Включите их в меню.</p>"
  }</div><p class="chart-help">Протяжка выбирает интервал; двойной клик возвращает полный диапазон. ← / →: курсор на 10 м. Разрывы не соединяются. Руль — нормированный ввод, не угол колёс.</p></div></section>`;
}
export function realTelemetryHTML(s, source) {
  const a = s.analysisStatus,
    ready = ["ready", "partial"].includes(a.phase),
    m = s.source.metadata;
  const start = `<div class="real-analysis" data-analysis-state="${a.phase}"><div class="page-title"><div><h1>Заезд сравнения</h1><p>${esc(m.track ?? "Трасса не установлена")} · ${esc(m.layout ?? "Конфигурация не установлена")} · ${s.source.kind === "synthetic" ? "TEST · синтетические профили" : "REAL · локальная запись"}</p></div><button data-action="import">Выбрать .duckdb</button></div><div class="telemetry-context">${tabs(s)}${s.pair ? `<button class="pair-toggle" aria-expanded="${!!s.pairOpen}">A · круг ${esc(s.a)} / B · круг ${esc(s.b)} · изменить пару</button>` + pairHTML(s, source) : ""}</div>`;
  if (!ready)
    return (
      start +
      `<section class="panel real-analysis-status" role="status"><h2>${{ pending: "Подготовка сравнения", failed: "Сравнение не выполнено", unavailable: "Сравнение недоступно" }[a.phase]}</h2>${a.phase === "pending" ? '<progress aria-label="Подготовка профилей и сравнение"></progress>' : ""}<p>${esc(a.message)}</p><div class="row">${s.pair ? `<button data-real-analysis="${a.phase === "pending" ? "cancel" : "retry"}">${a.phase === "pending" ? "Отменить сравнение" : "Повторить сравнение"}</button>` : ""}<a href="#sessions">Сессии и круги</a></div></section></div>`
    );
  if (!["overview", "pitwall"].includes(s.mode))
    return (
      start +
      `<section class="panel real-unavailable"><h2>${s.mode === "map" ? "Измеренная карта пока недоступна" : "Этот раздел ещё не подключён"}</h2><p>В Phase 3 доступны дистанционные графики, сравнение времени и общий курсор. Пространственные пути, новые советы и setup не выводятся из этих сигналов.</p><button data-mode="pitwall">Открыть Pit Wall</button></section></div>`
    );
  const times = `<div class="overview-lap-result"><div class="identity-a"><span>A · круг ${esc(s.a)} · записанный Lap Time</span><strong>${lapTime(a.recordedA)}</strong></div><div class="identity-b"><span>B · круг ${esc(s.b)} · записанный Lap Time</span><strong>${lapTime(a.recordedB)}</strong></div><div><span>B − A · записанный полный круг</span><strong id="real-recorded-difference">${signed(a.recordedDifferenceS)}</strong></div></div>`;
  return (
    start +
    `<p class="real-analysis-status" role="status">${esc(a.message)}${a.plateau ? " Плато дистанции запрещает Δ, остальные валидные сигналы доступны." : ""}</p>` +
    (s.mode === "overview"
      ? `<section class="analysis-overview">${times}${comparisonHTML()}<div class="overview-grid"><div>${timingHTML(a)}<h2 class="real-hud-title">Сигналы у курсора</h2>${hudHTML()}<button data-mode="pitwall">Открыть Pit Wall</button></div>${qualityHTML(a)}</div><div class="overview-playback">${playback(s)}</div></section>`
      : `${comparisonHTML()}<div class="real-pitwall-grid">${chartsHTML(s)}<aside class="real-pitwall-context">${hudHTML()}${timingHTML(a)}<details><summary>Качество и контекст</summary>${qualityHTML(a)}</details></aside><section class="analysis-dock real-analysis-dock" aria-label="Общий курсор и воспроизведение">${playback(s)}</section></div>`) +
    `<p class="notice">Рабочий фильтр не подтверждает спортивную валидность LMU. Каналы остаются в памяти вкладки; отсутствующие значения не заменяются нулём.</p></div>`
  );
}

const setText = (root, id, value) => {
  const el = root.querySelector("#" + id);
  if (el && el.textContent !== value) el.textContent = value;
};
export function updateRealCursor(root, store) {
  const s = store.state,
    a = store.source.analysis;
  if (!a) return;
  const d = s.cursorM,
    va = store.source.valueAt(s.a, d),
    vb = store.source.valueAt(s.b, d),
    delta = store.source.deltaAt(d);
  setText(
    root,
    "comparison-speed",
    `A ${f(va?.speedMps === null ? null : va?.speedMps * 3.6, 1)} · B ${f(vb?.speedMps === null ? null : vb?.speedMps * 3.6, 1)} км/ч`,
  );
  setText(root, "comparison-distance", signed(delta));
  setText(root, "comparison-total", signed(a.summary.recordedDifferenceS));
  setText(root, "distance-output", `${f(d, 1)} м`);
  setText(root, "position-time", `B · ${f(s.playback.timeS)} с`);
  setText(
    root,
    "real-interval-label",
    `${f(s.range[0], 1)}–${f(s.range[1], 1)} м`,
  );
  setText(root, "real-interval-delta", signed(a.intervalDelta(...s.range)));
  for (const [k, [, unit, key, factor]] of Object.entries(REAL_CHANNELS)) {
    const av = va?.[key],
      bv = vb?.[key],
      da = Number.isFinite(av) ? av * factor : null,
      db = Number.isFinite(bv) ? bv * factor : null;
    const read =
      k === "delta" ? signed(delta) : `A ${f(da, 1)} · B ${f(db, 1)} ${unit}`;
    setText(root, "readout-" + k, read);
    setText(root, "hud-" + k, k === "delta" ? signed(delta) : `B ${f(db, 1)}`);
    setText(
      root,
      "hud-ref-" + k,
      k === "delta" ? "B − A · по общей дистанции" : `A ${f(da, 1)}`,
    );
    const plot = root.querySelector("#plot-" + k),
      cursor = plot?.querySelector("[data-cursor]");
    if (cursor) {
      const w = plot.viewBox.baseVal.width,
        x = 50 + ((d - s.range[0]) / (s.range[1] - s.range[0])) * (w - 64);
      cursor.setAttribute("x1", x);
      cursor.setAttribute("x2", x);
      cursor.dataset.distance = String(d);
      cursor.style.display = d !== null && x >= 50 && x <= w - 14 ? "" : "none";
    }
  }
  for (const [id, value] of [
    ["cursor", d],
    ["real-distance", d],
    ["real-time", s.playback.timeS],
  ]) {
    const input = root.querySelector("#" + id);
    if (
      input &&
      input !== document.activeElement &&
      input.value !== String(value ?? "")
    )
      input.value =
        value === null
          ? ""
          : id === "cursor"
            ? value
            : Number(value.toFixed(6));
  }
  const play = root.querySelector("#play");
  if (play) {
    setText(root, "play", s.playing ? "Пауза" : "Пуск");
    play.setAttribute("aria-pressed", String(s.playing));
    play.setAttribute(
      "aria-label",
      s.playing ? "Приостановить" : "Воспроизвести",
    );
  }
}
export function drawRealCharts(root, store) {
  const s = store.state,
    a = store.source.analysis;
  if (!a) return;
  for (const plot of root.querySelectorAll(".real-plot")) {
    const k = plot.dataset.channel,
      [label, unit, key, factor] = REAL_CHANNELS[k],
      w = plot.clientWidth || 600,
      h = 164;
    plot.setAttribute("viewBox", `0 0 ${w} ${h}`);
    plot.setAttribute("preserveAspectRatio", "none");
    const roles = k === "delta" ? ["b"] : ["a", "b"],
      lines = roles
        .filter((r) => s.series[r])
        .map((r) => ({
          role: r,
          runs: displaySegments(a.series(s[r], key), ...s.range, w - 64),
        }));
    const values = lines.flatMap((l) =>
      l.runs.flatMap((run) => run.map(([, v]) => v * factor)),
    );
    let lo = k === "steering" ? -100 : 0,
      hi = ["brake", "throttle", "steering"].includes(k) ? 100 : 1;
    if (k === "speed") hi = Math.max(1, ...values) * 1.05;
    if (k === "delta") {
      hi = Math.max(0.001, ...values.map(Math.abs)) * 1.1;
      lo = -hi;
    }
    const x = (d) =>
        50 + ((d - s.range[0]) / (s.range[1] - s.range[0])) * (w - 64),
      y = (v) => 132 - ((v * factor - lo) / (hi - lo)) * 110;
    let html = `<defs><clipPath id="real-clip-${k}"><rect x="50" y="16" width="${w - 64}" height="120"/></clipPath></defs><path class="axis" d="M50 18v114h${w - 64}M50 77h${w - 64}"/><text x="1" y="24">${f(hi, k === "delta" ? 2 : 0)}</text><text x="1" y="132">${f(lo, k === "delta" ? 2 : 0)}</text><text x="50" y="157">${f(s.range[0], 0)} м</text><text x="${w - 14}" y="157" text-anchor="end">${f(s.range[1], 0)} м</text>`;
    for (const { role, runs } of lines) {
      const path = runs
        .map(
          (run) =>
            run
              .map(
                ([d, v], i) =>
                  `${i ? "L" : "M"}${x(d).toFixed(2)},${y(v).toFixed(2)}`,
              )
              .join(" ") + (run.length === 1 ? "l.01,0" : ""),
        )
        .join(" ");
      html += `<path class="series" data-lap="${role}" data-runs="${runs.length}" clip-path="url(#real-clip-${k})" d="${path}" stroke="${k === "delta" ? "#ddd9fa" : role === "a" ? "#73d3ff" : "#ffc870"}" stroke-linecap="round" ${role === "b" && k !== "delta" ? 'stroke-dasharray="7 5"' : ""}/>`;
    }
    if (!values.length)
      html += `<text x="${w / 2}" y="80" text-anchor="middle">${lines.length ? "Нет валидных данных" : "Серии скрыты"}</text>`;
    html += '<line class="cursor" data-cursor y1="16" y2="132"/>';
    plot.innerHTML = html;
    plot.setAttribute(
      "aria-label",
      `${label}, ${unit}. ${values.length ? "Валидные серии; пропуски разорваны." : "Нет видимых данных."} Стрелки меняют курсор.`,
    );
  }
  updateRealCursor(root, store);
}
export function bindRealTelemetry(root, store, render) {
  const s = store.state;
  const pairToggle = root.querySelector(".pair-toggle");
  if (pairToggle)
    pairToggle.onclick = () => {
      s.pairOpen = !s.pairOpen;
      root
        .querySelector(".real-analysis-pair")
        ?.classList.toggle("pair-open", s.pairOpen);
      pairToggle.setAttribute("aria-expanded", String(s.pairOpen));
    };
  const precision = root.querySelector(".real-precision");
  if (precision) precision.ontoggle = () => (s.precisionOpen = precision.open);
  function seek(value, basis = "distance") {
    s.playing = false;
    const ok =
      basis === "time" ? store.seekTime(value) : store.seekDistance(value);
    if (!ok && precision) precision.open = true;
    setText(
      root,
      "real-seek-feedback",
      ok
        ? "Курсор установлен по измеренному профилю B."
        : "Здесь нет однозначной временной привязки B. Курсор сохранён; выберите валидную точку.",
    );
    updateRealCursor(root, store);
    return ok;
  }
  root
    .querySelectorAll("[data-real-analysis]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          el.dataset.realAnalysis === "cancel"
            ? store.cancelAnalysis()
            : void store.analyzePair()),
    );
  for (const [id, basis] of [
    ["real-distance", "distance"],
    ["real-time", "time"],
  ]) {
    const input = root.querySelector("#" + id);
    if (input)
      input.onchange = () =>
        seek(input.value === "" ? NaN : Number(input.value), basis);
  }
  const cursor = root.querySelector("#cursor");
  if (cursor)
    cursor.oninput = () => {
      if (!seek(Number(cursor.value))) cursor.value = s.cursorM ?? cursor.min;
    };
  const rate = root.querySelector("#rate");
  if (rate) rate.onchange = () => (s.rate = Number(rate.value));
  const channel = root.querySelector("#real-channel");
  if (channel)
    channel.onchange = () => {
      s.channel = channel.value;
      s.signals = [
        channel.value,
        ...s.signals.filter((k) => k !== channel.value),
      ];
      render();
    };
  root.querySelectorAll("[data-real-signal]").forEach(
    (el) =>
      (el.onchange = () => {
        s.signals = el.checked
          ? [...s.signals, el.dataset.realSignal]
          : s.signals.filter((k) => k !== el.dataset.realSignal);
        render();
      }),
  );
  for (const role of ["a", "b"]) {
    const el = root.querySelector("#real-series-" + role);
    if (el)
      el.onchange = () => {
        s.series[role] = el.checked;
        drawRealCharts(root, store);
      };
  }
  function range(start, end) {
    if (store.setAnalysisRange(start, end)) render();
  }
  for (const id of ["real-range-start", "real-range-end"]) {
    const el = root.querySelector("#" + id);
    if (el)
      el.onchange = () =>
        range(
          Number(root.querySelector("#real-range-start").value),
          Number(root.querySelector("#real-range-end").value),
        );
  }
  root.querySelectorAll("[data-real-range]").forEach(
    (el) =>
      (el.onclick = () => {
        const bounds = s.analysisStatus.bounds;
        if (!bounds) return;
        const [lo, hi] = s.range,
          width = hi - lo;
        switch (el.dataset.realRange) {
          case "full":
            range(...bounds);
            break;
          case "zoom":
            if (s.cursorM !== null)
              range(
                Math.max(bounds[0], s.cursorM - width / 4),
                Math.min(bounds[1], s.cursorM + width / 4),
              );
            break;
          case "left": {
            const delta = Math.min(width / 4, lo - bounds[0]);
            range(lo - delta, hi - delta);
            break;
          }
          case "right": {
            const delta = Math.min(width / 4, bounds[1] - hi);
            range(lo + delta, hi + delta);
            break;
          }
        }
      }),
  );
  for (const plot of root.querySelectorAll(".real-plot")) {
    let drag = null;
    const distance = (e) => {
      const r = plot.getBoundingClientRect();
      return Math.max(
        s.range[0],
        Math.min(
          s.range[1],
          s.range[0] +
            ((e.clientX - r.left - 50) / (r.width - 64)) *
              (s.range[1] - s.range[0]),
        ),
      );
    };
    plot.onpointerdown = (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, start: distance(e), x: e.clientX };
      plot.setPointerCapture(e.pointerId);
    };
    plot.onpointerup = (e) => {
      if (drag?.id !== e.pointerId) return;
      const saved = drag;
      drag = null;
      const end = distance(e);
      if (plot.hasPointerCapture(e.pointerId))
        plot.releasePointerCapture(e.pointerId);
      if (Math.abs(saved.x - e.clientX) > 10 && Math.abs(end - saved.start) > 2)
        range(Math.min(end, saved.start), Math.max(end, saved.start));
      else seek(end);
    };
    plot.onpointercancel = plot.onlostpointercapture = () => (drag = null);
    plot.ondblclick = () => range(...s.analysisStatus.bounds);
    plot.onkeydown = (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        seek(
          e.key === "Home"
            ? s.range[0]
            : e.key === "End"
              ? s.range[1]
              : (s.cursorM ?? s.range[0]) + (e.key === "ArrowRight" ? 10 : -10),
        );
      }
    };
  }
}
