import { setupTrainerWorkspace } from "./workspace-ui.js";
import { CIRCUITS, PARAMETERS, parameterBounds } from "../data/circuits.js";
import { TrainerState } from "./state.js";
import {
  signalsAt,
  evaluate,
  phaseAt,
  apexProgress,
  phaseMilestones,
  getDrivingProfile,
} from "./model.js";
import { TrackRenderer } from "./renderer.js";
import { SignalCharts } from "./charts.js";
import { TrackMap } from "./track-map.js";
import { linePoint, vehiclePose } from "./trajectory.js";
import { setupOffline } from "./offline.js";

setupTrainerWorkspace((key, on) => {
  state.sceneLayers[key] = on;
  renderFrame();
});
const $ = (id) => document.getElementById(id),
  state = new TrainerState();
const numberFormats = [0, 1, 2].map(
  (digits) =>
    new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
);
const format = (value, digits = 0) => numberFormats[digits].format(value);
const setText = (node, value) => {
  if (node.textContent !== value) node.textContent = value;
};
let frameId = 0,
  lastTime = null,
  evaluation = evaluate(state.corner, state.settings);
const charts = new SignalCharts($("charts"), (progress) => {
  state.seek(progress);
  stopAnimation();
  renderFrame();
});
const renderer = new TrackRenderer($("trackCanvas"), () => renderFrame());
let fullTrack = null,
  fullLoading = null,
  fullData = null,
  fullKey = "";
function prepareFullTrack() {
  const key = JSON.stringify([
    state.circuitId,
    state.cornerId,
    state.settings,
    $("trackOverlay").value,
    state.sceneLayers,
  ]);
  if (fullKey === key) return fullData;
  const circuit = CIRCUITS.find((c) => c.id === state.circuitId),
    corner = state.corner;
  const active = [],
    reference = [],
    segments = [],
    seekPoints = [];
  for (let i = 0; i <= 200; i++) {
    const progress = i / 200,
      point = linePoint(progress, corner.path, corner, state.settings);
    active.push(point);
    reference.push(linePoint(progress, corner.path, corner, corner.defaults));
    seekPoints.push({ ...point, progress });
    if (i > 0) {
      const signals = signalsAt(progress, corner, state.settings);
      segments.push({
        points: [active[i - 1], point],
        value: signals[$("trackOverlay").value],
      });
    }
  }
  fullKey = key;
  fullData = {
    revision: key,
    points: circuit.geometry.samples,
    active: state.sceneLayers.active ? active : null,
    activeColor: { green: "#c9fc60", yellow: "#f0cc76", red: "#ff807c" }[
      evaluation.level
    ],
    reference: state.sceneLayers.reference ? reference : null,
    segments: state.sceneLayers.active ? segments : [],
    seekPoints,
    overlay: $("trackOverlay").value,
    marks: [
      [state.settings.brakeStart / 100, "#ff807c"],
      [apexProgress(state.settings), "#f0cc76"],
      [state.settings.gasStart / 100, "#66dfa6"],
    ]
      .filter(
        (_, index) =>
          state.sceneLayers[
            ["brakeMarker", "apexMarker", "throttleMarker"][index]
          ],
      )
      .map(([progress, color]) => ({
        ...linePoint(progress, corner.path, corner, state.settings),
        color,
      })),
  };
  return fullData;
}
async function switchVisualization() {
  const requested = $("visualizationMode").value;
  if (requested !== "original" && !fullTrack) {
    $("visualizationNote").textContent =
      "Загрузка полного вида. Исходная сцена остаётся доступной.";
    try {
      fullLoading ??= import("./full-track-view.js");
      const { FullTrackView } = await fullLoading;
      fullTrack ??= new FullTrackView(
        $("fullTrackCanvas"),
        () => renderFrame(),
        (progress) => {
          state.seek(progress);
          stopAnimation();
          renderFrame();
        },
      );
    } catch {
      fullLoading = null;
      $("visualizationMode").value = "original";
      $("visualizationNote").textContent =
        "Полный вид недоступен. Используй исходную сцену; настройки сохранены.";
      return;
    }
  }
  // A later selection wins if loading overlapped a second change.
  state.setVisualization($("visualizationMode").value);
  $("trackCanvas").hidden = state.visualization !== "original";
  $("fullTrackCanvas").hidden = state.visualization === "original";
  $("fullOverlayControls").hidden = state.visualization === "original";
  $("originalCameraHint").hidden = state.visualization === "original";
  document
    .querySelectorAll("[data-visualization]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.visualization === state.visualization),
      ),
    );
  $("visualizationNote").textContent =
    state.visualization === "original"
      ? "Исходный вид сохранён. Камеры, педали и воспроизведение работают как прежде."
      : `OSM/ODbL · осевая линия, не лимиты трассы. Наложение только в учебном окне; это не реальный круг.${state.visualization === "full3d" ? " Плоская 3D-проекция: высота и банковка неизвестны." : " Коснись учебного окна для перемотки; остальные части контура не проигрываются."}`;
  renderSettings();
  renderFrame();
}
document.querySelectorAll("[data-visualization]").forEach((button) =>
  button.addEventListener("click", () => {
    $("visualizationMode").value = button.dataset.visualization;
    switchVisualization();
  }),
);
document.querySelectorAll("[data-overlay]").forEach((button) =>
  button.addEventListener("click", () => {
    $("trackOverlay").value = button.dataset.overlay;
    document
      .querySelectorAll("[data-overlay]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    renderFrame();
  }),
);
const trackMap = new TrackMap($("trackMap"), selectCorner);
$("mapDetails").open = false;
if (!renderer.ctx) $("renderError").hidden = false;
const select = $("circuitSelect");
const circuitDialog = $("circuitDialog");
CIRCUITS.forEach((circuit) => {
  const option = document.createElement("button");
  option.type = "button";
  option.dataset.circuit = circuit.id;
  option.textContent = circuit.name;
  option.addEventListener("click", () => {
    if (state.circuitId !== circuit.id) state.selectCircuit(circuit.id);
    circuitDialog.close();
    stopAnimation();
    renderAll();
  });
  $("circuitOptions").append(option);
});

function selectCorner(id) {
  state.selectCorner(id);
  stopAnimation();
  renderAll();
}
function renderCorners() {
  const circuit = CIRCUITS.find((c) => c.id === state.circuitId);
  const cards = $("cornerCards");
  if (cards.dataset.renderedCircuit !== circuit.id) {
    cards.dataset.renderedCircuit = circuit.id;
    cards.innerHTML = circuit.corners
      .map((corner) => {
        const points = corner.path.samples;
        const minX = Math.min(...points.map((p) => p.x)),
          minY = Math.min(...points.map((p) => p.y));
        const w = Math.max(...points.map((p) => p.x)) - minX,
          h = Math.max(...points.map((p) => p.y)) - minY;
        const path = points
          .map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`)
          .join(" ");
        return `<button type="button" class="corner-card" data-corner="${corner.id}" aria-pressed="false" aria-label="${corner.number} · ${corner.name}"><div><strong>${corner.number}</strong><span>${corner.name}</span></div><svg viewBox="${minX - 16} ${minY - 16} ${w + 32} ${h + 32}" aria-hidden="true"><path d="${path}" vector-effect="non-scaling-stroke"/></svg></button>`;
      })
      .join("");
    cards
      .querySelectorAll("button")
      .forEach((button) =>
        button.addEventListener("click", () =>
          selectCorner(button.dataset.corner),
        ),
      );
  }
  cards
    .querySelectorAll("button")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(state.cornerId === button.dataset.corner),
      ),
    );
  trackMap.update(circuit, state.cornerId);
  $("geometryLength").textContent =
    `${format(circuit.geometry.length)} м по координатам · LMU: 6 019 м`;
}
function buildParameters() {
  const groups = [
    [
      "Подход и торможение",
      ["entrySpeed", "brakeStart", "brakeIntensity", "release"],
    ],
    ["Дуга и траектория", ["apexSpeed", "apexPosition", "line"]],
    ["Выход", ["gasStart", "gasRamp"]],
  ];
  $("parameters").innerHTML = groups
    .map(
      ([title, keys]) =>
        `<fieldset><legend>${title}</legend>${keys
          .map((key) => {
            const param = PARAMETERS.find((p) => p.key === key);
            return `<div class="parameter"><div class="parameter-heading"><label for="${param.key}">${param.label}</label><output for="${param.key}" id="${param.key}Output"></output></div><input id="${param.key}" type="range" step="${param.step ?? 1}" data-param="${param.key}"><div class="parameter-ticks"><span>${param.from}</span><span>${param.to}</span></div></div>`;
          })
          .join("")}</fieldset>`,
    )
    .join("");
  const grip = PARAMETERS.find((p) => p.key === "grip");
  $("parameters").insertAdjacentHTML(
    "beforeend",
    `<details class="model-assumptions"><summary>Допущения модели</summary><p>Постоянный общий предел сцепления; без шин, аэродинамики и неровностей LMU. Проверяй, как меняется результат при другом допущении.</p><div class="parameter"><div class="parameter-heading"><label for="grip">${grip.label}</label><output for="grip" id="gripOutput"></output></div><input id="grip" type="range" step="${grip.step}" data-param="grip"><div class="parameter-ticks"><span>${grip.from}</span><span>${grip.to}</span></div></div><p>Прямая: v² = v₀² + 2aΔs. Дуга: a = v² / R. Совместная нагрузка ограничена кругом сцепления. Полный тормоз: 16 м/с², тяга: 5 м/с², выбег: 0,25 м/с² — условные постоянные. ABS и TC ограничивают действие педалей; точная работа систем не моделируется.</p></details>`,
  );
  $("parameters")
    .querySelectorAll("input")
    .forEach((input) =>
      input.addEventListener("input", () => {
        state.setParameter(input.dataset.param, Number(input.value));
        stopAnimation();
        renderAll(false);
      }),
    );
}
function renderSettings() {
  const settings = state.settings;
  $("circuitName").textContent = CIRCUITS.find(
    (c) => c.id === state.circuitId,
  ).name;
  $("circuitOptions")
    .querySelectorAll("button")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.circuit === state.circuitId),
      ),
    );
  PARAMETERS.forEach((param) => {
    const input = $(param.key),
      [min, max] = parameterBounds(state.corner, param);
    input.min = min;
    input.max = max;
    input.value = settings[param.key];
    input.disabled = state.mode === "learn";
    const value = `${format(settings[param.key], param.digits ?? 0)} ${param.unit}`;
    $(param.key + "Output").textContent = value;
    input.setAttribute("aria-valuetext", value);
  });
  $("sceneMode").textContent =
    state.mode === "learn" ? "Обучение" : "Эксперимент";
  $("modeDescription").textContent =
    state.mode === "learn"
      ? "Учебный пример зафиксирован. Запусти движение и проследи за педалями. Для настройки выбери «Эксперимент»."
      : "Меняй один параметр за раз. Настройки каждого поворота сохраняются в этой вкладке.";
  document
    .querySelectorAll("[data-mode]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mode === state.mode),
      ),
    );
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.view === state.view),
      ),
    );
  $("jumpBrakeValue").textContent =
    `${format((apexProgress(settings) - settings.brakeStart / 100) * state.corner.path.length)} м до ориентира`;
  $("jumpThrottleValue").textContent =
    `${format(Math.abs((settings.gasStart / 100 - apexProgress(settings)) * state.corner.path.length))} м ${settings.gasStart / 100 < apexProgress(settings) ? "до" : "после"} апекса`;
  $("cornerDistance").textContent =
    `Учебное окно: ${format(state.corner.path.length)} м`;
  $("cameraNote").textContent = {
    top: "Карта OSM · границы приблизительные",
    cockpit: "Учебная 2D-проекция · кабина",
    chase: "Учебная 2D-проекция · сзади",
  }[state.view];
  if (state.visualization !== "original")
    $("cameraNote").textContent =
      state.visualization === "full2d"
        ? "Вся трасса · учебное окно"
        : "Плоская 3D · без высоты";
  $("trackCanvas").setAttribute(
    "aria-label",
    `${state.corner.number} ${state.corner.name}: ${$("cameraNote").textContent}, автомобиль и учебная линия`,
  );
  $("cornerTitle").textContent = "";
  $("cornerTitle").append(document.createTextNode(state.corner.number + " "));
  const name = document.createElement("span");
  name.textContent = state.corner.name;
  $("cornerTitle").append(name);
  $("cornerSubtitle").textContent = state.corner.subtitle;
  $("cornerFocus").textContent = state.corner.focus;
}
function renderEvaluation() {
  evaluation = evaluate(state.corner, state.settings);
  $("evaluationSummary").dataset.level = evaluation.level;
  $("evaluationTitle").textContent = evaluation.title;
  $("sceneEvaluation").textContent =
    `Учебная оценка: ${evaluation.title.toLowerCase()}`;
  $("sceneEvaluation").dataset.level = evaluation.level;
  $("lineLegend").dataset.level = evaluation.level;
  const labels = {
    green: "В допущениях",
    yellow: "Обрати внимание",
    red: "Проверь",
  };
  $("evaluationChecks").innerHTML = evaluation.checks
    .map(
      (check) =>
        `<div class="evaluation-check" data-level="${check.level}"><div><strong>${check.label}</strong><span>${labels[check.level]}</span></div><p>${check.text}</p></div>`,
    )
    .join("");
}
function renderModel() {
  const profile = getDrivingProfile(state.corner, state.settings),
    m = profile.metrics;
  $("apexResult").textContent =
    `${format(m.achievedApexSpeed)} / ${format(m.targetApexSpeed)} км/ч`;
  $("brakingResult").textContent =
    `${format(m.availableDistanceM)} / ${format(m.minimumDistanceM)} м`;
  $("modelWarning").hidden = evaluation.level === "green";
  $("modelWarning").textContent =
    evaluation.checks.find((c) => c.level === evaluation.level)?.text ?? "";
  $("modelWarning").dataset.level = evaluation.level;
  const milestones = phaseMilestones(state.corner, state.settings);
  $("phaseButtons")
    .querySelectorAll("button")
    .forEach(
      (button, index) => (button.dataset.progress = milestones[index].progress),
    );
}
function renderAll(corners = true) {
  if (corners) renderCorners();
  renderSettings();
  renderEvaluation();
  renderModel();
  charts.update(state.corner, state.settings);
  renderFrame();
}
function renderFrame() {
  $("overlayScale").hidden = state.visualization === "original";
  setText(
    $("overlayScale"),
    {
      line: "Линии учебные. Для сравнения смещения крупно выбери исходный вид.",
      speed:
        "Учебная скорость: 0–250 км/ч. Насыщенность показывает величину, а не оценку техники.",
      brake:
        "Заданный тормоз: 0–100%. Цвет отображает давление педали, не силу сцепления.",
      throttle:
        "Заданный газ: 0–100%. Цвет отображает педаль, не измеренную тягу.",
    }[$("trackOverlay").value],
  );
  const signals = signalsAt(state.progress, state.corner, state.settings),
    phase = phaseAt(state.progress, state.corner, state.settings);
  if (state.visualization === "original")
    renderer.render(state, signals, evaluation);
  else if (fullTrack)
    fullTrack.render(
      prepareFullTrack(),
      state.visualization,
      state.sceneLayers.vehicle
        ? [
            vehiclePose(
              state.progress,
              state.corner.path,
              state.corner,
              state.settings,
            ),
          ]
        : [],
    );
  charts.render(signals);
  trackMap.render(state);
  setText(
    $("distanceReadout"),
    `${format(state.progress * state.corner.path.length)} / ${format(state.corner.path.length)} м`,
  );
  $("progress").value = state.progress * 100;
  setText($("progressOutput"), `${format(state.progress * 100)}%`);
  $("progress").setAttribute(
    "aria-valuetext",
    `${format(state.progress * 100)}% участка`,
  );
  setText($("previewTime"), `${format(state.animationElapsed, 1)} с`);
  setText($("sceneSpeed"), format(signals.speed));
  for (const [id, value, unit] of [
    ["speedValue", signals.speed, "км/ч"],
    ["brakeValue", signals.brake, "%"],
    ["throttleValue", signals.throttle, "%"],
    ["steeringValue", signals.steering, "%"],
  ]) {
    setText($(id).firstChild, format(value)); // Keep the existing unit node.
    setText($(id).querySelector("small"), unit);
  }
  setText($("phaseReadout"), phase.title);
  setText($("coachTitle"), phase.title);
  setText($("coachText"), phase.text);
  setText(
    $("phaseSnapshot"),
    `${format(state.progress * 100)}% окна · ${format(signals.speed)} км/ч · тормоз ${format(signals.brake)}% · газ ${format(signals.throttle)}%`,
  );
  $("phaseButtons")
    .querySelectorAll("button")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.phase === phase.id),
      ),
    );
  setText(
    $("gripReadout"),
    `${format(signals.gripDemand * 100)}% от принятого предела`,
  );
  const assists = [];
  if (signals.absDemand > 0.5)
    assists.push(
      `ABS: условное ограничение · тормозное усилие ${format(signals.effectiveBrake)}%`,
    );
  if (signals.tcDemand > 0.5)
    assists.push(
      `TC: условное ограничение · тяга ${format(signals.effectiveThrottle)}%`,
    );
  setText(
    $("assistReadout"),
    assists.join("; ") || "ABS / TC: ограничение не требуется по модели",
  );
  $("gripReadout").dataset.level =
    signals.gripDemand > 1.02
      ? "red"
      : signals.gripDemand > 0.9
        ? "yellow"
        : "green";
  // Replacing a pressed button's text node each frame can cancel WebKit's click.
  const finished =
    state.progress >=
    (getDrivingProfile(state.corner, state.settings).stopProgress ?? 1);
  $("play").dataset.state = state.playing
    ? "pause"
    : finished
      ? "replay"
      : "play";
  $("play").setAttribute(
    "aria-label",
    state.playing
      ? "Приостановить воспроизведение"
      : finished
        ? "Повторить воспроизведение"
        : "Начать воспроизведение",
  );
  $("play").setAttribute("aria-pressed", String(state.playing));
  setText(
    $("playbackRate"),
    `${format(state.rate, Number.isInteger(state.rate) ? 0 : 1)}×`,
  );
  $("playbackRate").setAttribute(
    "aria-label",
    `Скорость воспроизведения: ${state.rate}`,
  );
}
function stopAnimation() {
  cancelAnimationFrame(frameId);
  frameId = 0;
  lastTime = null;
}
function animate(now) {
  if (!state.playing) {
    stopAnimation();
    return;
  }
  if (lastTime !== null) state.advance((now - lastTime) / 1000);
  lastTime = now;
  renderFrame();
  if (state.playing) frameId = requestAnimationFrame(animate);
  else stopAnimation();
}
function togglePlay() {
  state.togglePlay();
  stopAnimation();
  renderFrame();
  if (state.playing) frameId = requestAnimationFrame(animate);
}
select.addEventListener("click", () => {
  state.pause();
  stopAnimation();
  renderFrame();
  circuitDialog.showModal();
});
$("closeCircuit").addEventListener("click", () => circuitDialog.close());
document.querySelectorAll("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    state.setView(button.dataset.view);
    if (state.visualization !== "original") {
      $("visualizationMode").value = "original";
      switchVisualization();
    }
    renderSettings();
    renderFrame();
  }),
);
document.querySelectorAll("[data-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    state.setMode(button.dataset.mode);
    stopAnimation();
    renderAll(false);
  }),
);
$("play").addEventListener("click", togglePlay);
$("playbackRate").addEventListener("click", () => {
  state.cycleRate();
  renderFrame();
});
$("progress").addEventListener("input", () => {
  state.seek(Number($("progress").value) / 100);
  stopAnimation();
  renderFrame();
});
for (const [id, position] of [
  ["jumpBrake", () => state.settings.brakeStart / 100],
  ["jumpApex", () => apexProgress(state.settings)],
  ["jumpThrottle", () => state.settings.gasStart / 100],
])
  $(id).addEventListener("click", () => {
    state.seek(position());
    stopAnimation();
    renderFrame();
  });
$("reset").addEventListener("click", () => {
  state.reset();
  stopAnimation();
  renderAll(false);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    state.pause();
    stopAnimation();
    renderFrame();
  }
});
window.addEventListener("pagehide", () => {
  state.pause();
  stopAnimation();
});
window.addEventListener("pageshow", () => {
  renderer.resize();
  renderFrame();
});
document.addEventListener("keydown", (event) => {
  // Native buttons and ranges keep their built-in keyboard behavior.
  if (
    /^(INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY|A)$/.test(event.target.tagName) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  }
  if (event.code === "ArrowRight" || event.code === "ArrowLeft") {
    event.preventDefault();
    state.seek(state.progress + (event.code === "ArrowRight" ? 0.02 : -0.02));
    stopAnimation();
    renderFrame();
  }
});
$("phaseButtons").innerHTML = phaseMilestones(state.corner, state.settings)
  .map(
    (phase) =>
      `<button type="button" data-phase="${phase.id}" aria-pressed="false">${phase.title}</button>`,
  )
  .join("");
$("phaseButtons")
  .querySelectorAll("button")
  .forEach((button) =>
    button.addEventListener("click", () => {
      state.seek(Number(button.dataset.progress));
      stopAnimation();
      renderFrame();
    }),
  );
buildParameters();
renderAll();
$("retryOffline").addEventListener("click", () => location.reload());
setupOffline(
  $("offlineStatus"),
  $("updateBanner"),
  $("updateApp"),
  $("offlineHelp"),
);
