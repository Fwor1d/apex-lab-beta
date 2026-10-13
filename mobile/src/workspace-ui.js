const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};
const $ = (selector) => document.querySelector(selector);
function disclosure(title, content, open = false) {
  const d = node("details", "workspace-disclosure");
  d.open = open;
  d.append(node("summary", "", title), content);
  return d;
}
function toolbar(center, controls, insights, onFocus = () => {}) {
  const bar = node("div", "workspace-toolbar"),
    buttons = [];
  const expand = node("button", "workspace-button", "Фокус");
  expand.id = "expandWorkspace";
  expand.type = "button";
  expand.setAttribute("aria-pressed", "false");
  function refresh() {
    const focus = document.body.classList.contains("workspace-expanded");
    for (const { button, label, target } of buttons) {
      const shown = !focus && !target.classList.contains("panel-collapsed");
      button.setAttribute("aria-expanded", String(shown));
      button.textContent = shown ? label : `Показать ${label.toLowerCase()}`;
    }
    expand.setAttribute("aria-pressed", String(focus));
    expand.textContent = focus ? "Вернуть обзор" : "Фокус";
    expand.setAttribute(
      "aria-label",
      focus
        ? "Выйти из режима фокуса"
        : "Режим фокуса: карта, воспроизведение и выбранные сигналы",
    );
  }
  function setFocus(on) {
    document.body.classList.toggle("workspace-expanded", on);
    onFocus();
    refresh();
  }
  function show(id) {
    if (document.body.classList.contains("workspace-expanded")) setFocus(false);
    const { button, target } = buttons.find((item) => item.button.id === id);
    target.classList.remove("panel-collapsed");
    document.body.classList.remove(button.id + "-collapsed");
    refresh();
  }
  for (const [id, label, target] of [
    ["toggleControls", "Настройки", controls],
    ["toggleInsights", "Разбор", insights],
  ]) {
    const button = node("button", "workspace-button", label);
    button.type = "button";
    button.id = id;
    target.id ||= id + "Panel";
    button.setAttribute("aria-controls", target.id);
    buttons.push({ button, label, target });
    button.addEventListener("click", () => {
      if (document.body.classList.contains("workspace-expanded")) {
        show(id);
        return;
      }
      const hidden = !target.classList.contains("panel-collapsed");
      target.classList.toggle("panel-collapsed", hidden);
      document.body.classList.toggle(id + "-collapsed", hidden);
      refresh();
    });
    bar.append(button);
  }
  expand.addEventListener("click", () =>
    setFocus(!document.body.classList.contains("workspace-expanded")),
  );
  bar.append(expand);
  center.prepend(bar);
  // Wrapped controls and enlarged text change the obstruction height.
  // This variable affects scroll margins only, so observing it cannot resize the bar.
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(() => {
      document.body.style.setProperty(
        "--workspace-toolbar-height",
        `${bar.getBoundingClientRect().height}px`,
      );
    }).observe(bar);
  refresh();
  return { showControls: () => show("toggleControls") };
}
function checkbox(container, key, label, checked, change, disabled = false) {
  const wrap = node("label", "workspace-check"),
    input = node("input");
  input.type = "checkbox";
  input.checked = checked;
  input.disabled = disabled;
  input.dataset.layer = key;
  wrap.append(input, node("span", "", label));
  input.addEventListener("change", () => change(key, input.checked));
  container.append(wrap);
  return input;
}
function layers(title) {
  const details = node("details", "workspace-layers");
  details.id = title;
  details.tabIndex = -1;
  details.append(node("summary", "", "Слои"));
  const contents = node("div", "layer-options");
  details.append(contents);
  const close = node("button", "workspace-button", "Закрыть слои");
  close.type = "button";
  close.addEventListener("click", () => {
    details.open = false;
    details.querySelector("summary").focus();
  });
  contents.append(close);
  details.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      details.open = false;
      details.querySelector("summary").focus();
    }
  });
  return { details, contents };
}
export function setupTrainerWorkspace(onLayer) {
  document.body.classList.add("racing-workspace", "trainer-workspace");
  $(".intro").remove();
  const main = $("main"),
    context = $(".circuit-panel"),
    center = $("#trainer"),
    right = $(".settings-column"),
    settings = $(".settings-panel"),
    scene = $(".scene-panel");
  main.prepend(node("h1", "workspace-title", "Тренажёр поворотов"));
  context.classList.add("work-controls");
  center.classList.add("work-center");
  right.classList.add("work-insights");
  right.removeAttribute("id");
  right.setAttribute("aria-label", "Учебный разбор");
  const experiment = disclosure("Параметры эксперимента", settings, true);
  experiment.id = "settings";
  context.append(experiment);
  context.append($(".mode-tabs"));
  settings.prepend($("#modeDescription"));
  const model = node("section", "model-overview");
  const modelExplanation = node("div");
  modelExplanation.append($(".model-note"));
  model.append(
    node("h2", "", "Учебный расчёт"),
    $(".model-results"),
    $("#modelWarning"),
    disclosure("Допущения расчёта", modelExplanation),
  );
  right.prepend(model);
  right.append($("#coach"));
  const technique = node(
    "p",
    "workspace-provenance",
    "Учебный разбор · не наблюдения реальной записи. Измеренные выводы доступны в разделе «Телеметрия».",
  );
  const sourceDetails = disclosure("Источник и ограничения", technique);
  right.prepend(sourceDetails);
  const layer = layers("sceneLayers");
  scene.querySelector(".scene-heading").append(layer.details);
  const initial = {
    reference: true,
    active: true,
    brakeMarker: true,
    apexMarker: true,
    throttleMarker: true,
    vehicle: true,
  };
  const names = {
    reference: "Линия учебного примера",
    active: "Планируемая линия",
    brakeMarker: "Учебная точка тормоза",
    apexMarker: "Учебный апекс",
    throttleMarker: "Начало газа",
    vehicle: "Положение автомобиля",
  };
  for (const key of Object.keys(initial))
    checkbox(layer.contents, key, names[key], true, onLayer);
  const disabled = node(
    "p",
    "workspace-provenance",
    "Измеренные A/B, дельта круга и реальные траектории отсутствуют в учебной модели.",
  );
  layer.contents.append(disabled);
  const heatmap = node("div", "layer-heatmap");
  heatmap.append(node("p", "", "Цвет полной карты · один сигнал"));
  heatmap.append($("#fullOverlayControls"), $("#overlayScale"));
  layer.contents.append(heatmap);
  checkbox(
    layer.contents,
    "realDelta",
    "Дельта на карте · данных нет",
    false,
    () => {},
    true,
  );
  for (const [key, label] of [
    ["pedals", "Педали"],
    ["speed", "Скорость"],
    ["steering", "Руль"],
  ]) {
    checkbox(
      layer.contents,
      "graph-" + key,
      label + " · график",
      true,
      (_key, on) => {
        const row = document
          .querySelector(`[data-chart="${key}"]`)
          ?.closest(".chart-row");
        if (row) row.hidden = !on;
      },
    );
  }
  const reset = node("button", "workspace-button", "Сбросить слои");
  reset.type = "button";
  reset.id = "resetLayers";
  reset.addEventListener("click", () => {
    layer.contents
      .querySelectorAll("input[data-layer]:not(:disabled)")
      .forEach((i) => {
        i.checked = true;
        if (i.dataset.layer.startsWith("graph-")) {
          const key = i.dataset.layer.slice(6);
          const row = document
            .querySelector(`[data-chart="${key}"]`)
            ?.closest(".chart-row");
          if (row) row.hidden = false;
        } else onLayer(i.dataset.layer, true);
      });
  });
  reset.addEventListener("click", () => $('[data-overlay="line"]').click());
  layer.contents.append(reset);
  const modes = node("div", "scene-tools");
  modes.append($(".visualization-controls"), $(".camera-tabs"));
  scene.querySelector(".viewport").before(modes);
  const accuracy = node("div");
  accuracy.append($("#visualizationNote"), $("#originalCameraHint"));
  scene.append(disclosure("Точность текущего вида", accuracy));
  right.prepend($(".scene-status"));
  const player = node("div", "workspace-player");
  player.append($(".playback"), $(".playback-footer"));
  const markers = $(".marker-actions"),
    values = $(".signal-values"),
    grip = $(".grip-status"),
    signals = $("#signals"),
    modeTabs = $(".mode-tabs");
  signals.append(disclosure("Сигналы и единицы", $(".chart-caption")));
  const assist = $("#assistReadout");
  grip.append(disclosure("ABS / TC · допущения", assist));
  right.prepend(
    node(
      "p",
      "workspace-provenance model-source-label",
      "Учебная модель · не запись LMU",
    ),
    values,
    grip,
  );
  right.insertBefore(model, grip);
  const evaluation = $("#evaluationChecks");
  const evaluationParent = evaluation.parentElement;
  evaluationParent.append(disclosure("Проверки учебной модели", evaluation));
  const descriptions = node("div");
  descriptions.append($(".evaluation-panel > .settings-note"));
  $(".evaluation-panel").append(disclosure("Как читать оценку", descriptions));
  const mobileControls = node("aside", "mobile-control-details");
  mobileControls.setAttribute(
    "aria-label",
    "Дополнительные настройки тренажёра",
  );
  center.after(mobileControls);
  const extras = [...context.children].filter(
    (el) => !["circuitSelect", "cornerCards"].includes(el.id),
  );
  const breakpoint = matchMedia("(max-width: 900px)");
  function arrange() {
    const focused = document.body.classList.contains("workspace-expanded");
    if (breakpoint.matches) {
      mobileControls.append(...extras);
      scene.querySelector(".viewport").after(player);
      scene.querySelector(".scene-legend").after(markers);
      center.insertBefore(right, signals);
      right.prepend(modeTabs);
    } else {
      context.append(...extras);
      context.insertBefore(modeTabs, experiment);
      if (focused) scene.querySelector(".viewport").after(player);
      else context.insertBefore(player, $("#mapDetails"));
      context.insertBefore(markers, experiment);
      main.querySelector(".workspace").append(right);
    }
  }
  arrange();
  breakpoint.addEventListener("change", arrange);
  window.addEventListener(
    "pagehide",
    () => breakpoint.removeEventListener("change", arrange),
    { once: true },
  );
  const panelControl = toolbar(center, context, right, arrange);
  $('.mobile-nav a[href="#settings"]').addEventListener("click", () => {
    experiment.open = true;
    panelControl.showControls();
  });
  document
    .querySelector('[data-mode="experiment"]')
    .addEventListener("click", () => {
      experiment.open = true;
    });
  return { initial };
}
export function setupAnalyzerWorkspace(onDistance) {
  document.body.classList.add("racing-workspace", "analyzer-workspace");
  const main = $("main"),
    intro = $(".intro"),
    analysis = $("#analysis"),
    recording = $("#recording");
  intro.querySelector("h1").textContent =
    document.body.dataset.mode === "reports"
      ? "Просмотр отчёта"
      : "Анализ телеметрии";
  intro.classList.add("workspace-titlebar");
  const shell = node("div", "analysis-workspace"),
    controls = node("aside", "work-controls"),
    center = node("div", "work-center"),
    right = node("aside", "work-insights");
  controls.setAttribute("aria-label", "Запись и настройки");
  right.setAttribute("aria-label", "Наблюдения Coaching Engine");
  main.append(shell);
  shell.append(controls, center, right);
  const empty = node("section", "analysis-empty");
  empty.append(
    node("h2", "", "Ваш круг — на этом устройстве"),
    node(
      "p",
      "",
      "Откройте локальный DuckDB или JSON-отчёт. Здесь появятся схема дистанции, синхронные сигналы и измеренные наблюдения.",
    ),
  );
  center.append(empty, analysis);
  controls.append(
    $(".file-bar"),
    $("#status"),
    $("#error"),
    $("#jump-analysis"),
    recording,
  );
  const compare = $(".compare-controls");
  controls.append(disclosure("Круги A / B", compare, true));
  controls.append($(".export-controls"));
  controls.append($("#diagnostics"));
  const contextTitle = node("div", "analysis-context");
  const badge = node("p", "workspace-provenance");
  badge.id = "workspaceSourceBadge";
  contextTitle.append($("#source-summary"), badge);
  analysis.before(contextTitle);
  controls.append(disclosure("Достоверность источника", $("#source-kind")));
  const safe = node(
    "p",
    "workspace-provenance",
    "Файлы остаются на устройстве. Модель автомобиля определяется только подтверждёнными метаданными.",
  );
  controls.prepend(safe);
  right.append(
    $("#lap-comparison"),
    disclosure("Дельта по дистанции · не Lap Time", $("#comparison-summary")),
    $("#findings-section"),
    $("#investigation"),
  );
  const guidance = node("div");
  guidance.append($("#findings-empty"));
  $("#findings").before(disclosure("Как читать наблюдения", guidance));
  const traces = $("#traces"),
    map = $("#full-map-section");
  analysis.prepend(map);
  map.classList.add("central-map");
  const overview = node("div", "distance-overview");
  overview.id = "distanceOverview";
  overview.append(
    node("h3", "", "Схема дистанции"),
    node(
      "p",
      "workspace-provenance",
      "Линейная схема Lap Dist, не географическая траектория. Цветные участки — измеренные диапазоны разбора.",
    ),
  );
  const svgTemplate = document.createElement("template");
  svgTemplate.innerHTML = "<svg></svg>"; // Constant markup only; metadata uses textContent.
  const strip = svgTemplate.content.firstChild,
    svgNamespace = strip.namespaceURI;
  strip.id = "distanceStrip";
  strip.setAttribute("role", "img");
  strip.setAttribute("aria-label", "Измеренные участки на оси дистанции");
  strip.setAttribute("viewBox", "0 0 640 120");
  overview.append(strip);
  analysis.prepend(overview);
  const observer = new MutationObserver(() => {
    const hidden = analysis.hidden;
    empty.hidden = !hidden;
    right.hidden = hidden;
    compare.closest("details").hidden = hidden;
    $(".export-controls").hidden = hidden;
  });
  observer.observe(analysis, { attributes: true, attributeFilter: ["hidden"] });
  right.hidden = true;
  compare.closest("details").hidden = true;
  $(".export-controls").hidden = true;
  const l = layers("analysisLayers");
  const graphKeys = [
    "speedMps",
    "brake",
    "throttle",
    "steeringNormalized",
    "deltaS",
  ];
  const graphNames = [
    "Скорость",
    "Тормоз",
    "Газ",
    "Положение руля",
    "Дельта B − A",
  ];
  strip.addEventListener("pointerdown", (event) => {
    if (!onDistance || !strip.dataset.end) return;
    const rect = strip.getBoundingClientRect(),
      width = Number(strip.dataset.width),
      first = Number(strip.dataset.start),
      last = Number(strip.dataset.end);
    const pixel = ((event.clientX - rect.left) * width) / rect.width;
    onDistance(
      first +
        (last - first) * Math.max(0, Math.min(1, (pixel - 24) / (width - 48))),
    );
  });
  const visible = Object.fromEntries(graphKeys.map((k) => [k, true]));
  function apply() {
    document
      .querySelectorAll("#charts > .chart")
      .forEach((el, i) => (el.hidden = !visible[graphKeys[i]]));
  }
  graphKeys.forEach((key, i) =>
    checkbox(l.contents, key, graphNames[i] + " · график", true, (k, on) => {
      visible[k] = on;
      apply();
    }),
  );
  [
    "Реальные машины A/B · привязка отсутствует",
    "Педали и Δt на карте · привязка отсутствует",
    "Высота и банковка · данных нет",
  ].forEach((label, i) =>
    checkbox(l.contents, "unavailable" + i, label, false, () => {}, true),
  );
  const reset = node("button", "workspace-button", "Все графики");
  reset.type = "button";
  reset.id = "resetGraphLayers";
  reset.addEventListener("click", () => {
    graphKeys.forEach((k) => (visible[k] = true));
    l.contents
      .querySelectorAll("input[data-layer]:not(:disabled)")
      .forEach((i) => (i.checked = true));
    apply();
  });
  l.contents.append(reset);
  toolbar(center, controls, right);
  center.querySelector(".workspace-toolbar").append(l.details);
  const breakpoint = matchMedia("(max-width: 900px)");
  function arrange() {
    if (breakpoint.matches) analysis.insertBefore(right, traces);
    else shell.append(right);
  }
  arrange();
  breakpoint.addEventListener("change", arrange);
  window.addEventListener("pagehide", () => observer.disconnect(), {
    once: true,
  });
  window.addEventListener(
    "pagehide",
    () => breakpoint.removeEventListener("change", arrange),
    { once: true },
  );
  let lastDraw = null;
  const view = {
    apply,
    clear() {
      lastDraw = null;
      strip.replaceChildren();
      delete strip.dataset.end;
    },
    revealGraphs: () => reset.click(),
    renderDistance(comparison, regions, cursor, selectedRange = null) {
      lastDraw = [comparison, regions, cursor, selectedRange];
      strip.replaceChildren();
      if (!comparison?.distanceM?.length) return;
      const first = comparison.distanceM[0],
        last = comparison.distanceM.at(-1),
        span = last - first;
      if (!(span > 0)) return;
      const width = Math.max(280, strip.getBoundingClientRect().width);
      strip.setAttribute("viewBox", `0 0 ${width} 120`);
      strip.dataset.width = width;
      strip.dataset.start = first;
      strip.dataset.end = last;
      const x = (d) => 24 + ((width - 48) * (d - first)) / span;
      const add = (tag, attrs, text) => {
        const n = document.createElementNS(svgNamespace, tag);
        Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
        if (text) n.textContent = text;
        strip.append(n);
        return n;
      };
      add("line", {
        x1: 24,
        x2: width - 24,
        y1: 55,
        y2: 55,
        class: "distance-baseline",
      });
      for (const region of (regions ?? []).slice(0, 3)) {
        const range = region.distanceRangeM ??
          region.rangeM ?? [region.startM, region.endM];
        if (!range.every(Number.isFinite)) continue;
        const a = Math.max(first, range[0]),
          b = Math.min(last, range[1]);
        if (!(b > a)) continue;
        const mark = add("rect", {
          x: x(a),
          y: 39,
          width: Math.max(2, x(b) - x(a)),
          height: 32,
          class: "distance-region",
        });
        const title = document.createElementNS(svgNamespace, "title");
        title.textContent = `${Math.round(a)}–${Math.round(b)} м · измеренное окно`;
        mark.append(title);
      }
      if (selectedRange?.length === 2 && selectedRange.every(Number.isFinite)) {
        const a = Math.max(first, selectedRange[0]),
          b = Math.min(last, selectedRange[1]);
        if (b > a)
          add("rect", {
            x: x(a),
            y: 25,
            width: Math.max(2, x(b) - x(a)),
            height: 60,
            class: "distance-selected",
          });
      }
      add("line", {
        x1: x(cursor),
        x2: x(cursor),
        y1: 20,
        y2: 85,
        class: "distance-cursor",
      });
      add("text", { x: 24, y: 108 }, `${Math.round(first)} м`);
      add(
        "text",
        { x: width - 24, y: 108, "text-anchor": "end" },
        `${Math.round(last)} м`,
      );
    },
  };
  const resize = new ResizeObserver(() => {
    if (lastDraw) view.renderDistance(...lastDraw);
  });
  resize.observe(strip);
  window.addEventListener("pagehide", () => resize.disconnect(), {
    once: true,
  });
  return view;
}
