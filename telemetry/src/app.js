import { setupAnalyzerWorkspace } from "../../mobile/src/workspace-ui.js";
import { AnalyzerWorker } from "./client.js";
import { Traces, SIGNALS } from "./charts.js";
import { cleanProfile } from "./report.js";
import {
  findingPresentation,
  selectPriorityFindings,
  recordedComparison,
  friendlyError,
} from "./findings-view.js";
import { CoachingView } from "./coaching-view.js";
import { setupOffline } from "./offline.js";
const reportOnly = document.body.dataset.mode === "reports";
const workspaceUI = setupAnalyzerWorkspace((distance) => {
  $("cursor").value = distance;
  updateCursor();
});
const $ = (id) => document.getElementById(id),
  format = (value, digits = 2) =>
    Number.isFinite(value)
      ? value.toLocaleString("ru-RU", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })
      : "нет данных";
export const state = { session: null, result: null, metrics: {}, busy: false };
export let reportClient = new AnalyzerWorker(
  () => {},
  new URL("./report-worker.js", import.meta.url),
);
export let client = new AnalyzerWorker((text) => {
  $("status").textContent = text;
});
let pendingClient = null,
  timer = 0,
  lastTick = 0,
  maxTimerGap = 0;
let generation = 0,
  frame = 0,
  previous = 0,
  maxFrameGap = 0,
  frames = 0,
  highlightedRange = null;
const traces = new Traces($("charts"), (distance) => {
  $("cursor").value = distance;
  updateCursor();
});
function error(message) {
  $("error").textContent = friendlyError(message);
  $("error").hidden = false;
}
const coachingView = new CoachingView((finding) => {
  workspaceUI.revealGraphs();
  const range = finding.distanceRangeM;
  highlightedRange = range;
  $("cursor").value = Number.isFinite(finding.link?.distanceM)
    ? finding.link.distanceM
    : (range[0] + range[1]) / 2;
  $("zoom").checked = true;
  updateCursor();
  traces.setRegion(range);
});
function busy(value) {
  state.busy = value;
  $("lap-a").disabled = value;
  $("lap-b").disabled = value;
  $("cancel").hidden = !value;
  $("compare").disabled = value;
  $("export-report").disabled = value;
  $("export-profile").disabled = value;
}
function stopMonitor() {
  cancelAnimationFrame(frame);
  clearInterval(timer);
}
function monitor() {
  lastTick = performance.now();
  maxTimerGap = 0;
  timer = setInterval(() => {
    const now = performance.now();
    maxTimerGap = Math.max(maxTimerGap, now - lastTick);
    lastTick = now;
  }, 20);
  const loop = (time) => {
    if (previous) maxFrameGap = Math.max(maxFrameGap, time - previous);
    previous = time;
    frames++;
    frame = requestAnimationFrame(loop);
  };
  previous = 0;
  frames = 0;
  maxFrameGap = 0;
  frame = requestAnimationFrame(loop);
}
let mapContext = null,
  mapImport = null,
  mapToken = 0;
for (const [id, change] of [
  ["map-zoom-in", 1.2],
  ["map-zoom-out", 1 / 1.2],
  ["map-fit", null],
])
  $(id).addEventListener("click", () => {
    if (change === null) mapContext?.view.fit();
    else if (mapContext) mapContext.view.setZoom(mapContext.view.zoom * change);
  });
async function updateMapMode() {
  $("map-navigation").hidden = true;
  const token = ++mapToken,
    mode = $("telemetry-visualization").value;
  if (mode === "original") {
    mapContext?.cancelPending();
    $("telemetry-map").hidden = true;
    $("distanceOverview").hidden = false;
    $("telemetry-map-note").textContent =
      "Исходные графики сохранены. Сессия, круги и курсор не изменены.";
    return;
  }
  $("telemetry-map-note").textContent =
    "Загрузка справочной геометрии; графики остаются доступны.";
  try {
    mapImport ??= import("./map-context.js");
    const { MapContext } = await mapImport;
    if (token !== mapToken) return;
    mapContext ??= new MapContext($("telemetry-map"), () => {
      if ($("telemetry-visualization").value !== "original")
        mapContext.render($("telemetry-visualization").value);
    });
    if (!mapContext.data && !(await mapContext.load(state.session?.metadata))) {
      if (token !== mapToken) return;
      $("telemetry-map").hidden = true;
      $("distanceOverview").hidden = false;
      $("telemetry-map-note").textContent =
        "Для этой трассы/конфигурации нет проверенной геометрии. Исходные графики и дистанция доступны; позиционные данные не подменяются учебным Sebring.";
      return;
    }
    if (token !== mapToken) return;
    $("telemetry-map").hidden = false;
    $("distanceOverview").hidden = true;
    mapContext.render(mode);
    $("map-navigation").hidden = false;
    $("telemetry-map-note").textContent =
      mapContext.note() +
      (mode === "full3d"
        ? " Плоская 3D-проекция: высота и банковка неизвестны."
        : "");
  } catch {
    if (token !== mapToken) return;
    mapImport = null;
    $("telemetry-map").hidden = true;
    $("distanceOverview").hidden = false;
    $("telemetry-map-note").textContent =
      "Полная карта недоступна. Вернитесь к исходным графикам; анализ сохранён.";
  }
}
$("telemetry-visualization").addEventListener("change", updateMapMode);
function resetMap() {
  $("map-navigation").hidden = true;
  mapToken++;
  mapContext?.clear();
  $("telemetry-map").hidden = true;
  $("telemetry-visualization").value = "original";
  $("distanceOverview").hidden = false;
  $("telemetry-map-note").textContent =
    "Исходный анализ сохранён. Карта — отдельный необязательный слой.";
}
function reset() {
  resetMap();
  workspaceUI.clear();
  highlightedRange = null;
  generation++;
  pendingClient?.stop();
  pendingClient = null;
  client.stop();
  reportClient.stop();
  stopMonitor();
  state.session = null;
  state.result = null;
  state.metrics = {};
  coachingView.clear();
  $("legacy-findings").textContent = "";
  $("jump-analysis").hidden = true;
  $("recording").hidden = true;
  $("analysis").hidden = true;
  $("traces").hidden = true;
  $("findings").replaceChildren();
  $("clear").disabled = true;
  $("error").hidden = true;
  if ($("file")) $("file").value = "";
  $("report-file").value = "";
  traces.clear();
  busy(false);
  $("status").textContent =
    "Данные очищены из памяти. Выберите новую запись или отчёт.";
  $("metrics").textContent = "В памяти нет телеметрии.";
}
function diagnostics() {
  const m = state.metrics;
  $("metrics").textContent =
    Object.entries(m)
      .map(
        ([key, value]) =>
          `${key}: ${typeof value === "number" ? format(value, 2) : value}`,
      )
      .join("\n") +
    "\nЧисла памяти — proxy, не полный RSS или пик Wasm. rAF — интервалы кадров при открытии, не время всех long tasks.";
}
function sessionView(session) {
  resetMap();
  state.session = session;
  $("workspaceSourceBadge").textContent = session.laps.some(
    (l) => l.kind === "synthetic",
  )
    ? "Синтетический тест · не реальная поездка; подлинность JSON не подтверждена"
    : session.report
      ? "JSON-отчёт · исходная база и подлинность не проверены"
      : "Измеренная запись · модель автомобиля не установлена";
  $("recording").hidden = false;
  $("analysis").hidden = false;
  $("clear").disabled = false;
  $("source-summary").textContent =
    `${session.metadata.TrackName ?? "Трасса неизвестна"} · ${session.metadata.CarClass ?? "Класс неизвестен"} · ${session.metadata.SessionType ?? "Сессия неизвестна"}`;
  const synthetic = session.laps.some((lap) => lap.kind === "synthetic");
  $("source-kind").textContent = synthetic
    ? "СИНТЕТИЧЕСКИЕ ТЕСТОВЫЕ ДАННЫЕ. Сигналы и время придуманы для проверок, это не запись вашей поездки. JSON не подтверждает подлинность источника."
    : session.report
      ? `Имя в отчёте: ${session.metadata.CarName ?? "не установлено"}. Модель автомобиля не установлена. JSON: происхождение заявлено; исходный DuckDB и подлинность не проверены.`
      : `Имя в записи: ${session.metadata.CarName ?? "не установлено"}. Модель автомобиля не установлена. Исходный DuckDB прочитан локально.`;
  const option = document.createElement("option");
  option.value = session.sessionId ?? "active";
  option.textContent = `${session.metadata.SessionType ?? "Сессия"} · ${session.metadata.TrackName ?? "Трасса неизвестна"} · ${session.metadata.RecordingTime ?? "Время записи неизвестно"}`;
  $("session-select").replaceChildren(option);
  const entries = [
    [
      "Источник",
      synthetic
        ? "СИНТЕТИЧЕСКИЕ ТЕСТОВЫЕ ДАННЫЕ"
        : session.report
          ? "JSON · происхождение заявлено"
          : session.laps[0]?.kind === "synthetic"
            ? "СИНТЕТИЧЕСКАЯ БАЗА"
            : "Локальный исходный DuckDB",
    ],
    ["Трасса", session.metadata.TrackName],
    ["Конфигурация", session.metadata.TrackLayout],
    ["Имя автомобиля в записи", session.metadata.CarName],
    ["Модель автомобиля", "не установлена"],
    ["Класс", session.metadata.CarClass],
    ["Сессия", session.metadata.SessionType],
    ["Записано UTC", session.metadata.RecordingTime],
    [
      "Структура",
      session.report
        ? "Переносимый профиль"
        : `${session.schema.tableCount} таблиц · ${session.inventory.length} каналов · ${session.events.length} типов событий`,
    ],
  ];
  $("metadata").replaceChildren();
  for (const [label, value] of entries) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value ?? "неизвестно";
    $("metadata").append(dt, dd);
  }
  $("warnings").replaceChildren();
  for (const warning of session.warnings) {
    const li = document.createElement("li");
    li.textContent = warning;
    $("warnings").append(li);
  }
  $("laps").replaceChildren();
  for (const lap of session.laps) {
    const tr = document.createElement("tr");
    for (const value of [
      lap.lapId,
      format(lap.validation.recordedTimeS, 6),
      lap.validation.status,
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    $("laps").append(tr);
  }
  const eligible = session.laps.filter((lap) => lap.certified_valid);
  $("lap-summary").textContent =
    `${session.laps.length} сегментов; ${eligible.length} по рабочему фильтру без пит-лейна. ${session.fastest !== null ? `Лучший: круг ${session.fastest}.` : session.report ? "JSON не подтверждает исходный фильтр." : "Подходящих кругов для сравнения времени нет."}`;
  for (const id of ["lap-a", "lap-b"]) {
    $(id).replaceChildren();
    for (const lap of session.laps) {
      const option = document.createElement("option");
      option.value = lap.lapId;
      option.textContent = `Круг ${lap.lapId} · ${format(lap.validation.recordedTimeS, 3)} с · ${lap.validation.status}`;
      $(id).append(option);
    }
  }
  const a = session.fastest ?? session.laps[0]?.lapId,
    b =
      eligible.find((lap) => lap.lapId !== a)?.lapId ??
      (session.report ? session.laps[1]?.lapId : undefined) ??
      a;
  $("lap-a").value = a;
  $("lap-b").value = b;
  state.metrics = { ...session.metrics };
  diagnostics();
}
async function openFile(file, isReport = false) {
  if (!file) return;
  if (reportOnly && !isReport) {
    error(
      "В разделе отчётов выберите JSON. Исходный DuckDB открывается в разделе телеметрии.",
    );
    return;
  }
  const token = ++generation;
  pendingClient?.stop();
  stopMonitor();
  const candidate = new AnalyzerWorker(
    (text) => {
      if (token === generation) $("status").textContent = text;
    },
    new URL(isReport ? "./report-worker.js" : "./worker.js", import.meta.url),
  );
  pendingClient = candidate;
  busy(true);
  monitor();
  $("error").hidden = true;
  $("status").textContent = isReport
    ? "Проверка переносимого отчёта"
    : "Открытие локальной базы";
  try {
    const session = await candidate.call("open", { file });
    if (token !== generation) return;
    stopMonitor();
    session.metrics = {
      ...session.metrics,
      mainThreadMaxRafGapMs: maxFrameGap,
      mainThreadFrames: frames,
      mainThreadMaxTimerGapMs: maxTimerGap,
    };
    client.stop();
    reportClient.stop();
    if (isReport) reportClient = candidate;
    else client = candidate;
    pendingClient = null;
    state.result = null;
    coachingView.clear();
    $("findings").replaceChildren();
    $("legacy-findings").textContent = "";
    traces.clear();
    $("traces").hidden = true;
    sessionView(session);
    $("status").textContent = isReport
      ? "Отчёт открыт локально. Исходная база не проверялась."
      : "База прочитана, исходный файл закрыт. Данные остаются только в памяти.";
    busy(false);
    if (session.laps.length) await compareSelected();
  } catch (e) {
    candidate.stop();
    if (token === generation) {
      pendingClient = null;
      stopMonitor();
      error(e.message);
      $("status").textContent = state.session
        ? "Новый файл не открыт. Предыдущий анализ сохранён; выберите другой файл."
        : "Открытие не завершено. Выберите поддерживаемый файл или повторите попытку.";
      busy(false);
    }
  }
}
function cancelImport() {
  if (!pendingClient && state.busy) {
    reset();
    $("status").textContent =
      "Обработка отменена; Worker и данные освобождены. Выберите файл снова.";
    return;
  }
  generation++;
  pendingClient?.stop();
  pendingClient = null;
  stopMonitor();
  busy(false);
  $("status").textContent = state.session
    ? "Обработка отменена. Предыдущий анализ сохранён."
    : "Обработка отменена. Выберите файл заново.";
}
async function compareSelected() {
  if (!state.session || state.busy) return;
  const token = generation;
  busy(true);
  $("error").hidden = true;
  try {
    const a = $("lap-a").value,
      b = $("lap-b").value;
    const result = state.session.report
      ? await reportClient.call("compare", { a, b })
      : await client.call("compare", { a, b });
    if (token !== generation) return;
    state.result = result;
    state.metrics = {
      ...state.metrics,
      comparisonMs: result.comparisonMs,
      coachingMs: result.coachingMs ?? null,
      graphPreparationMs: result.graphPreparationMs ?? null,
    };
    const renderStart = performance.now();
    const d = result.comparison.distanceM;
    $("cursor").min = d[0];
    $("cursor").max = d.at(-1);
    $("cursor").value = d[0];
    $("traces").hidden = false;
    traces.prepare(result.comparison);
    workspaceUI.apply();
    highlightedRange = null;
    updateCursor();
    state.metrics.graphRenderMs = performance.now() - renderStart;
    const finite = Array.from(result.comparison.deltaS).filter(Number.isFinite),
      last = finite.at(-1);
    $("comparison-summary").textContent =
      a === b
        ? "Отдельный просмотр круга. Дельта к этому же кругу не является оценкой техники."
        : `B − A на последнем общем отсчёте: ${format(last, 6)} с. Общих точек с дельтой: ${format(result.comparison.coverage * 100, 4)}%. ${result.comparison.plateau ? "Плато дистанции: дельта отключена." : ""} Это не обязательно точная разница Lap Time на линии финиша.`;
    const recorded = recordedComparison(state.session, a, b);
    $("lap-comparison").replaceChildren();
    for (const [label, value] of [
      [
        `A · круг ${a}${a === state.session.fastest ? " · самый быстрый по фильтру" : ""}`,
        recorded.aTimeS,
      ],
      [`B · круг ${b}`, recorded.bTimeS],
      ["Записанная разница B − A", recorded.deltaS],
    ]) {
      const p = document.createElement("p"),
        strong = document.createElement("strong");
      p.textContent = label;
      strong.textContent = Number.isFinite(value)
        ? `${value > 0 && label.startsWith("Записанная") ? "+" : ""}${format(value, 6)} с`
        : "нет данных";
      p.append(strong);
      $("lap-comparison").append(p);
    }
    $("legacy-findings").textContent = JSON.stringify(result.findings, null, 2);
    if (result.coaching)
      coachingView.render(
        result.coaching,
        state.session.laps.some((lap) => lap.kind === "synthetic"),
      );
    else renderFindings(result.findings);
    $("jump-analysis").hidden = false;
    diagnostics();
  } catch (e) {
    if (token === generation) {
      state.result = null;
      coachingView.clear();
      $("traces").hidden = true;
      $("findings").replaceChildren();
      $("lap-comparison").replaceChildren();
      $("comparison-summary").textContent =
        "Сравнение не выполнено. Выберите один круг для просмотра или два подходящих круга из этой сессии.";
      $("findings-empty").textContent =
        "Недостаточно совместимых данных для сравнительных наблюдений.";
      error(e.message);
    }
  } finally {
    if (token === generation) busy(false);
  }
}
function renderFinding(finding, compact = false) {
  const view = findingPresentation(finding),
    li = document.createElement("li"),
    title = document.createElement("strong"),
    status = document.createElement("p"),
    explanation = document.createElement("p"),
    action = document.createElement("p");
  title.textContent = view.title;
  status.className = "finding-status";
  status.textContent =
    (state.session?.laps.some((lap) => lap.kind === "synthetic")
      ? "Наблюдение в синтетическом тесте — не реальная поездка"
      : view.label) + " · есть ограничения частоты и привязки сигналов";
  explanation.textContent = view.explanation;
  action.textContent = view.action;
  li.append(title, status, explanation, action);
  if (view.range && !compact) {
    const jump = document.createElement("button");
    jump.className = "secondary finding-jump";
    jump.textContent = `Проверить участок ${format(view.range[0], 0)}–${format(view.range[1], 0)} м`;
    jump.addEventListener("click", () => {
      $("cursor").value = (view.range[0] + view.range[1]) / 2;
      $("zoom").checked = true;
      updateCursor();
      $("traces").scrollIntoView({ block: "start" });
      $("cursor").focus({ preventScroll: true });
    });
    li.append(jump);
  }
  const detail = document.createElement("details"),
    summary = document.createElement("summary"),
    evidence = document.createElement("pre");
  summary.textContent = "Исходные численные основания и неопределённость";
  evidence.textContent = JSON.stringify(finding, null, 2);
  detail.append(summary, evidence);
  li.append(detail);
  return li;
}
function renderFindings(findings) {
  $("findings").replaceChildren();
  $("findings-empty").textContent = findings.length
    ? "Сначала показаны измеренные изменения времени с наибольшим модулем, без перекрывающихся участков. Они не складываются в отдельную потерю. Причины и техника требуют проверки по повтору; минимум скорости не обязательно апекс."
    : "Для отдельного круга или недостаточных данных сравнительные рекомендации не формируются. Исследуйте доступные сигналы ниже.";
  const { primary, remaining } = selectPriorityFindings(findings);
  for (const finding of primary) $("findings").append(renderFinding(finding));
  if (remaining.length) {
    const more = document.createElement("details"),
      summary = document.createElement("summary"),
      list = document.createElement("ol");
    more.className = "all-findings";
    summary.textContent = `Все остальные наблюдения: ${remaining.length}`;
    for (const finding of remaining) list.append(renderFinding(finding, true));
    more.append(summary, list);
    $("findings").append(more);
  }
}
function updateCursor() {
  if (!state.result) return;
  const c = state.result.comparison,
    requested = Number($("cursor").value);
  let index = 0;
  while (
    index + 1 < c.distanceM.length &&
    Math.abs(c.distanceM[index + 1] - requested) <=
      Math.abs(c.distanceM[index] - requested)
  )
    index++;
  const distance = c.distanceM[index];
  $("distance").textContent = format(distance, 2) + " м";
  workspaceUI.renderDistance(
    c,
    state.result.coaching?.sections ?? [],
    distance,
    highlightedRange,
  );
  $("map-distance").textContent =
    `Общий курсор: ${format(distance, 2)} м по Lap Dist. Положение на справочном контуре не установлено.`;
  traces.setCursor(distance, $("zoom").checked);
  $("readout").querySelector("tbody").replaceChildren();
  for (const [key, label, unit, , factor] of SIGNALS) {
    const tr = document.createElement("tr"),
      values =
        key === "deltaS"
          ? [null, c.deltaS[index]]
          : [c.a[key][index], c.b[key][index]];
    for (const value of [
      label,
      ...values.map((v) =>
        Number.isFinite(v)
          ? format(v * factor, key === "deltaS" ? 6 : 2) + " " + unit
          : "нет данных",
      ),
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    $("readout").querySelector("tbody").append(tr);
  }
}
function download(value, name) {
  const url = URL.createObjectURL(
      new Blob(
        [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
        { type: "application/json" },
      ),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function profilesSelected() {
  const ids = [$("lap-a").value, $("lap-b").value];
  const profiles = [];
  for (const a of ids)
    if (!profiles.some((p) => p.provenance.lapId === a))
      profiles.push(
        state.session.report
          ? await reportClient.call("profile", { a })
          : await client.call("profile", { a }),
      );
  return profiles;
}
$("file")?.addEventListener("change", (event) =>
  openFile(event.target.files[0]),
);
$("report-file").addEventListener("change", (event) =>
  openFile(event.target.files[0], true),
);
$("clear").addEventListener("click", reset);
$("cancel").addEventListener("click", cancelImport);
$("compare").addEventListener("click", compareSelected);
$("cursor").addEventListener("input", updateCursor);
$("zoom").addEventListener("change", updateCursor);
$("export-report").addEventListener("click", async () => {
  if (!state.session || state.busy) return;
  const token = generation;
  busy(true);
  $("status").textContent = "Подготовка локального JSON-отчёта в Worker";
  try {
    const exported = await (state.session.report ? reportClient : client).call(
      "export-report",
      { a: $("lap-a").value, b: $("lap-b").value },
    );
    if (token !== generation) return;
    download(exported.text, "apex-local-report.json");
    state.metrics.exportMs = exported.exportMs;
    diagnostics();
    $("status").textContent =
      "Локальный отчёт подготовлен; файл сохраняется через браузер.";
  } catch (e) {
    if (token === generation) error(e.message);
  } finally {
    if (token === generation) busy(false);
  }
});
$("export-profile").addEventListener("click", async () => {
  try {
    download(
      cleanProfile((await profilesSelected())[0]),
      "apex-lap-profile.json",
    );
  } catch (e) {
    error(e.message);
  }
});
window.addEventListener("pagehide", () => {
  mapToken++;
  mapContext?.dispose();
  mapContext = null;
  pendingClient?.stop();
  client.stop();
  reportClient.stop();
});
$("jump-analysis").addEventListener("click", () => {
  $("analysis").scrollIntoView({ block: "start" });
  $("lap-a").focus({ preventScroll: true });
});
setupOffline();
if (reportOnly) {
  if ($("file")) $("file").disabled = true;
  $("status").textContent =
    "Выберите локальный JSON-отчёт. DuckDB и Wasm для просмотра не загружаются.";
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    reset();
    $("status").textContent =
      "Выберите файл снова: при уходе со страницы ресурсы анализа освобождены.";
  }
});
performance.mark("apex-analysis-ready");
