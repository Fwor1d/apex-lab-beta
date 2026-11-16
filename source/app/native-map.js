// R5.2 native surface. No clock, coordinate interpolation, geographic registration or event detection.
import { escapeHTML as esc } from "./sessions.js";
import { spatialBounds } from "./data/native-spatial.js";
import {
  CAMERA_LIMITS,
  fitNativeBounds,
  cameraFrame,
  viewBox,
} from "./native-camera.js";
export function nativeMapHTML(s) {
  const spatial = s.spatialStatus;
  return `<section class="native-map panel" id="native-map-host" data-spatial-state="${spatial.phase}" aria-label="Записанные локальные траектории"><div class="section-head"><div><span class="eyebrow">${s.source.kind === "synthetic" ? "TEST · синтетический стенд" : "REAL · координаты записи"}</span><h2>Траектории A / B</h2></div><span class="native-frame-label">Локальный кадр</span></div><div class="native-toolbar" aria-label="Камера"><button id="native-fit">Вписать</button><label class="field"><span>Камера</span><select id="native-follow"><option value="fit">Весь путь</option><option value="a">Следовать за A</option><option value="b">Следовать за B</option><option value="manual">Свободная</option></select></label><div class="native-zoom"><button id="native-minus" aria-label="Отдалить карту">−</button><output id="native-zoom-value">1×</output><button id="native-plus" aria-label="Приблизить карту">+</button></div></div><p class="native-status" role="status">${esc(spatial.message)}</p><div class="native-loading-actions">${spatial.phase === "pending" ? '<progress aria-label="Проверка координат"></progress><button id="native-cancel">Отменить карту</button>' : ["failed", "cancelled", "unavailable"].includes(spatial.phase) ? '<button id="native-retry">Повторить проверку</button>' : ""}</div><div class="native-stage" ${spatial.bounds ? "" : "hidden"}><svg id="native-scene" tabindex="0" role="img" aria-label="Локальные пути A и B. Стрелки: камера, плюс и минус: масштаб, Home: вписать." preserveAspectRatio="xMidYMid meet"><g id="native-paths"></g><g id="native-ranges"></g><g id="native-markers"></g></svg></div><div class="native-map-footer" ${spatial.bounds ? "" : "hidden"}><div><div class="native-legend"><span class="identity-a">A · базовый</span><span class="identity-b">B · разбираемый</span></div><p id="native-position-status"></p><p id="native-follow-status"></p><p class="native-gesture-help">Протяжка — камера · щипок / колесо — масштаб</p></div><svg id="native-mini" tabindex="0" role="img" aria-label="Мини-карта общего кадра. Клик перемещает камеру; стрелки и Home управляют камерой." preserveAspectRatio="xMidYMid meet"></svg></div><details class="native-provenance"><summary>Источник и ограничения карты</summary><p>Исходные отсчёты координат 10 Гц, без сглаживания и замыкания. Позиция — ближайший записанный отсчёт в пределах 0,051 с; пропуски и границы не экстраполируются. A и B сопоставлены по общей Lap Dist.</p><p>Единицы кадра: candidate-metre. Физический масштаб и географическая привязка независимо не подтверждены. Нейтральные маркеры не показывают физический yaw. Это не официальные границы или ширина трассы.</p><p>События торможения, апексы и советы на REAL-карте пока отключены: проверенная пространственная семантика событий не подключена.</p></details></section>`;
}
const NS = "http://www.w3.org/2000/svg";
function svgElement(name, attrs) {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
export function mountNativeMap(root, store) {
  const host = root.querySelector("#native-map-host");
  if (!host) return null;
  const ownSource = store.source,
    ownAnalysis = ownSource.analysis;
  const scene = host.querySelector("#native-scene"),
    mini = host.querySelector("#native-mini");
  const fitControl = host.querySelector("#native-fit");
  const followControl = host.querySelector("#native-follow");
  const zoomIn = host.querySelector("#native-plus");
  const zoomOut = host.querySelector("#native-minus");
  const disableCamera = () => {
    fitControl.disabled =
      followControl.disabled =
      zoomIn.disabled =
      zoomOut.disabled =
        true;
  };
  const trajectory = ownSource.trajectory,
    state = store.state;
  const abort = new AbortController(),
    listen = (el, type, fn, opts = {}) =>
      el?.addEventListener(type, fn, { ...opts, signal: abort.signal });
  let disposed = false,
    needsMeasure = false,
    frame = null,
    fit = null,
    miniFit = null,
    lastVisibility = `${state.series.a}:${state.series.b}`,
    lastRange = "",
    size = { width: 0, height: 0 };
  const bounds = {},
    paths = {},
    ranges = {},
    markers = {},
    miniMarkers = {};
  if (trajectory)
    for (const role of ["a", "b"]) {
      const path = trajectory.paths[role];
      if (!path) continue;
      bounds[role] = spatialBounds([path]);
      const d = trajectory.pathData(role);
      paths[role] = svgElement("path", {
        d,
        class: `native-path native-${role}`,
        "data-native-path": role,
      });
      host.querySelector("#native-paths").append(paths[role]);
      ranges[role] = svgElement("path", {
        class: `native-range native-${role}`,
        "data-native-range": role,
      });
      host.querySelector("#native-ranges").append(ranges[role]);
      const marker = svgElement("g", {
        class: `native-marker native-${role}`,
        "data-native-marker": role,
      });
      marker.append(
        svgElement("circle", { cx: 0, cy: 0, r: 1 }),
        svgElement("text", { x: 1, y: -1 }),
      );
      marker.lastChild.textContent = role.toUpperCase();
      host.querySelector("#native-markers").append(marker);
      markers[role] = marker;
      mini.append(
        svgElement("path", {
          d,
          class: `native-path native-${role}`,
          "data-mini-path": role,
        }),
      );
      miniMarkers[role] = svgElement("circle", {
        class: `native-mini-marker native-${role}`,
        r: 1,
      });
      mini.append(miniMarkers[role]);
    }
  const viewport = svgElement("rect", {
    class: "native-viewport",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  mini.append(viewport);
  const setCamera = (camera) => {
    if (!disposed) state.nativeCamera = camera;
  };
  const fresh = () =>
    !disposed &&
    store.source === ownSource &&
    ownSource.analysis === ownAnalysis &&
    ownSource.trajectory === trajectory;
  const union = () => {
    const selected = ["a", "b"]
      .filter((r) => state.series[r] && bounds[r])
      .map((r) => bounds[r]);
    return selected.length
      ? {
          minX: Math.min(...selected.map((b) => b.minX)),
          maxX: Math.max(...selected.map((b) => b.maxX)),
          minY: Math.min(...selected.map((b) => b.minY)),
          maxY: Math.max(...selected.map((b) => b.maxY)),
        }
      : null;
  };
  const reset = () =>
    setCamera({ mode: "fit", follow: "b", zoom: 1, cx: null, cy: null });
  const move = (cx, cy, zoom = frame?.zoom ?? 1) => {
    if ([cx, cy, zoom].every(Number.isFinite))
      setCamera({
        mode: "manual",
        follow: state.nativeCamera?.follow ?? "b",
        cx,
        cy,
        zoom: Math.max(CAMERA_LIMITS.min, Math.min(CAMERA_LIMITS.max, zoom)),
      });
  };
  const zoom = (factor, px = 0.5, py = 0.5) => {
    if (!frame) return;
    const z = Math.max(
        CAMERA_LIMITS.min,
        Math.min(CAMERA_LIMITS.max, frame.zoom * factor),
      ),
      ratio = frame.zoom / z;
    move(
      frame.cx + (px - 0.5) * frame.width * (1 - ratio),
      frame.cy + (py - 0.5) * frame.height * (1 - ratio),
      z,
    );
  };
  const setText = (id, text) => {
    const el = host.querySelector(id);
    if (el.textContent !== text) el.textContent = text;
  };
  function update() {
    if (!fresh()) return;
    if (!trajectory?.summary.bounds) {
      disableCamera();
      return;
    }
    const visible = `${state.series.a}:${state.series.b}`;
    if (visible !== lastVisibility) {
      lastVisibility = visible;
      fit = null;
      if (state.nativeCamera) reset();
    }
    if (!fit) fit = fitNativeBounds(union(), size.width, size.height);
    const camera = state.nativeCamera ?? { mode: "fit", follow: "b", zoom: 1 };
    const positions = Object.fromEntries(
      ["a", "b"].map((role) => [
        role,
        state.series[role]
          ? ownSource.positionAt(state[role], state.cursorM)
          : null,
      ]),
    );
    if (camera.mode === "follow") {
      const p = positions[camera.follow];
      if (p && (camera.cx !== p.x || camera.cy !== -p.y)) {
        setCamera({ ...camera, cx: p.x, cy: -p.y });
      }
      setText(
        "#native-follow-status",
        p
          ? `Камера следует за ${camera.follow.toUpperCase()}`
          : "Следование приостановлено: нет доступной позиции.",
      );
    } else
      setText(
        "#native-follow-status",
        camera.mode === "manual"
          ? "Свободная камера · курсор сохранён"
          : "Весь видимый путь",
      );
    frame = cameraFrame(fit, state.nativeCamera ?? camera);
    if (!frame) {
      disableCamera();
      scene.style.visibility = "hidden";
      mini.style.visibility = "hidden";
      setText(
        "#native-position-status",
        `Нет видимых допустимых путей. Для карты доступны: ${Object.keys(paths)
          .map((r) => r.toUpperCase())
          .join(" / ")}. Включите их в графиках.`,
      );
      return;
    }
    fitControl.disabled = followControl.disabled = false;
    scene.style.visibility = "";
    mini.style.visibility = "";
    scene.setAttribute("viewBox", viewBox(frame));
    scene.dataset.cursor = String(state.cursorM);
    scene.dataset.camera = state.nativeCamera?.mode ?? "fit";
    const range = state.range.join(":");
    if (range !== lastRange) {
      lastRange = range;
      for (const role of Object.keys(ranges))
        ranges[role].setAttribute("d", trajectory.pathData(role, state.range));
    }
    for (const role of Object.keys(paths)) {
      paths[role].style.display = ranges[role].style.display = state.series[
        role
      ]
        ? ""
        : "none";
      mini.querySelector(`[data-mini-path="${role}"]`).style.display = state
        .series[role]
        ? ""
        : "none";
      const p = positions[role],
        marker = markers[role],
        small = miniMarkers[role];
      marker.style.display = small.style.display = p ? "" : "none";
      if (p) {
        marker.setAttribute("transform", `translate(${p.x},${-p.y})`);
        marker.dataset.time = String(p.timeS);
        marker.dataset.distance = String(p.distanceM);
        const radius = (frame.width / size.width) * 6;
        marker.firstChild.setAttribute(
          "r",
          radius * (role === "a" ? 1.3 : 0.8),
        );
        marker.lastChild.setAttribute("x", radius * (role === "a" ? -2 : 2));
        marker.lastChild.setAttribute(
          "text-anchor",
          role === "a" ? "end" : "start",
        );
        marker.lastChild.setAttribute(
          "y",
          radius * (role === "a" ? -1.8 : 2.8),
        );
        marker.lastChild.setAttribute(
          "font-size",
          (frame.width / size.width) * 13,
        );
        small.setAttribute("cx", p.x);
        small.setAttribute("cy", -p.y);
        small.setAttribute("r", (miniFit.width / 152) * 3);
      }
    }
    if (miniFit) {
      mini.setAttribute("viewBox", viewBox(miniFit));
      for (const [k, v] of Object.entries({
        x: frame.cx - frame.width / 2,
        y: frame.cy - frame.height / 2,
        width: frame.width,
        height: frame.height,
      }))
        viewport.setAttribute(k, v);
    }
    const available = Object.keys(paths);
    setText(
      "#native-position-status",
      ["a", "b"]
        .map(
          (r) =>
            `${r.toUpperCase()}: ${!state.series[r] ? "скрыт" : positions[r] ? "записанный отсчёт" : available.includes(r) ? "нет позиции у курсора" : trajectory.summary.individual[r] ? "наложение отключено" : "путь недоступен"}`,
        )
        .join(" · "),
    );
    followControl.value =
      state.nativeCamera?.mode === "follow"
        ? state.nativeCamera.follow
        : (state.nativeCamera?.mode ?? "fit");
    for (const r of ["a", "b"])
      host.querySelector(`#native-follow option[value="${r}"]`).disabled =
        !paths[r] || !state.series[r];
    setText("#native-zoom-value", `${frame.zoom.toFixed(1)}×`);
    zoomOut.disabled = frame.zoom <= CAMERA_LIMITS.min;
    zoomIn.disabled = frame.zoom >= CAMERA_LIMITS.max;
  }
  listen(fitControl, "click", reset);
  listen(followControl, "change", (e) => {
    const value = e.target.value;
    if (value === "fit") reset();
    else if (value === "manual" && frame) move(frame.cx, frame.cy);
    else if (paths[value] && frame)
      setCamera({
        mode: "follow",
        follow: value,
        zoom: Math.max(3, frame.zoom),
        cx: frame.cx,
        cy: frame.cy,
      });
  });
  listen(zoomIn, "click", () => zoom(1.25));
  listen(zoomOut, "click", () => zoom(1 / 1.25));
  listen(host.querySelector("#native-cancel"), "click", () =>
    store.cancelTrajectory(),
  );
  listen(host.querySelector("#native-retry"), "click", () => {
    void store.loadTrajectory(true);
  });
  const keys = (e) => {
    if (!frame) return;
    const { key } = e;
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
        "Home",
        "0",
      ].includes(key)
    )
      return;
    e.preventDefault();
    if (key === "Home" || key === "0") reset();
    else if (key === "+" || key === "=") zoom(1.25);
    else if (key === "-") zoom(1 / 1.25);
    else
      move(
        frame.cx +
          ({ ArrowLeft: -0.1, ArrowRight: 0.1 }[key] ?? 0) * frame.width,
        frame.cy + ({ ArrowUp: -0.1, ArrowDown: 0.1 }[key] ?? 0) * frame.height,
      );
  };
  listen(scene, "keydown", keys);
  listen(mini, "keydown", keys);
  listen(
    scene,
    "wheel",
    (e) => {
      if (!frame) return;
      e.preventDefault();
      const r = scene.getBoundingClientRect();
      zoom(
        Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.005),
        (e.clientX - r.left) / r.width,
        (e.clientY - r.top) / r.height,
      );
    },
    { passive: false },
  );
  const pointers = new Map();
  let gesture = null;
  const resetGesture = () => {
    const ps = [...pointers.values()];
    gesture =
      frame && ps.length
        ? {
            frame: { ...frame },
            center: {
              x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
              y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
            },
            distance:
              ps.length === 2
                ? Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y)
                : 0,
          }
        : null;
  };
  listen(scene, "pointerdown", (e) => {
    if (!frame || e.button !== 0 || pointers.size >= 2) return;
    e.preventDefault();
    scene.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    scene.setPointerCapture(e.pointerId);
    resetGesture();
  });
  listen(scene, "pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ps = [...pointers.values()],
      center = {
        x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
        y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
      },
      r = scene.getBoundingClientRect(),
      g = gesture;
    const z = Math.max(
        CAMERA_LIMITS.min,
        Math.min(
          CAMERA_LIMITS.max,
          g.frame.zoom *
            (ps.length === 2 && g.distance > 0
              ? Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y) / g.distance
              : 1),
        ),
      ),
      ratio = g.frame.zoom / z;
    move(
      g.frame.cx +
        ((g.center.x - r.left - r.width / 2) / r.width) * g.frame.width -
        ((center.x - r.left - r.width / 2) / r.width) * g.frame.width * ratio,
      g.frame.cy +
        ((g.center.y - r.top - r.height / 2) / r.height) * g.frame.height -
        ((center.y - r.top - r.height / 2) / r.height) * g.frame.height * ratio,
      z,
    );
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (scene.hasPointerCapture(e.pointerId))
      scene.releasePointerCapture(e.pointerId);
    resetGesture();
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    listen(scene, type, end);
  let miniDrag = null;
  const miniMove = (e) => {
    if (!miniFit || !frame) return;
    const matrix = mini.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    move(p.x, p.y);
  };
  listen(mini, "pointerdown", (e) => {
    if (e.button !== 0) return;
    miniDrag = e.pointerId;
    mini.setPointerCapture(e.pointerId);
    miniMove(e);
  });
  listen(mini, "pointermove", (e) => {
    if (miniDrag === e.pointerId) miniMove(e);
  });
  const miniEnd = (e) => {
    if (miniDrag !== e.pointerId) return;
    miniDrag = null;
    if (mini.hasPointerCapture(e.pointerId))
      mini.releasePointerCapture(e.pointerId);
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    listen(mini, type, miniEnd);
  const measure = () => {
    const r = scene.getBoundingClientRect();
    size = { width: r.width, height: r.height };
    fit = null;
    const m = mini.getBoundingClientRect();
    miniFit = fitNativeBounds(trajectory?.summary.bounds, m.width, m.height);
    update();
  };
  const observer = new ResizeObserver(() => {
    needsMeasure = true;
  });
  measure();
  observer.observe(host.querySelector(".native-stage"));
  const unsubscribe = store.subscribe(update);
  if (state.spatialStatus.phase === "idle") void store.loadTrajectory();
  update();
  return {
    update,
    flushLayout() {
      if (needsMeasure && !disposed) {
        needsMeasure = false;
        measure();
      }
    },
    destroy() {
      disposed = true;
      abort.abort();
      observer.disconnect();
      unsubscribe();
      pointers.clear();
      gesture = null;
    },
  };
}
