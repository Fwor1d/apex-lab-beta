import { loadAtlas, geometryURL } from "../telemetry/src/atlas.js";
import { MapContext } from "../telemetry/src/map-context.js";
const $ = (id) => document.getElementById(id);
let atlas,
  generation = 0;
let map = new MapContext($("atlas-canvas"), () =>
  map.render($("atlas-mode").value),
);
const option = (value, text) => {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  return o;
};
const current = () => atlas.tracks.find((t) => t.id === $("atlas-track").value);
function layouts() {
  $("atlas-layout").replaceChildren(
    ...current().layouts.map((l) =>
      option(
        l.id,
        `${l.name}${l.geometry ? " · справочная карта" : " · карта недоступна"}`,
      ),
    ),
  );
}
async function show() {
  const token = ++generation;
  map.clear();
  for (const id of ["atlas-in", "atlas-out", "atlas-fit"])
    $(id).disabled = true;
  $("atlas-canvas").hidden = true;
  $("atlas-status").textContent = "Загрузка выбранного контура…";
  $("atlas-download").hidden = true;
  const track = current(),
    layout = track.layouts.find((l) => l.id === $("atlas-layout").value);
  $("atlas-details").textContent = JSON.stringify(
    {
      atlasVersion: atlas.atlasVersion,
      layoutId: layout.id,
      quality: layout.quality,
      source: layout.source,
      length: layout.length,
      direction: layout.direction,
      startFinish: layout.startFinish,
      telemetryMapping: layout.telemetryMapping,
    },
    null,
    2,
  );
  try {
    const available = await map.load({
      TrackName: track.name,
      TrackLayout: layout.aliases[0],
    });
    if (token !== generation) return;
    $("atlas-canvas").hidden = !available;
    $("atlas-download").hidden = !available;
    if (available) $("atlas-download").href = geometryURL(layout).href;
    for (const id of ["atlas-in", "atlas-out", "atlas-fit"])
      $(id).disabled = !available;
    $("atlas-status").textContent = available
      ? `${track.name} · ${layout.name}. Справочный контур: соответствие LMU и позиционная привязка НЕ подтверждены. Реальные машины и телеметрические наложения отключены.`
      : "Нет проверенной геометрии этой конфигурации. Основной GP-контур не подставляется; телеметрический анализ остаётся доступным.";
    map.render($("atlas-mode").value);
  } catch {
    if (token === generation)
      $("atlas-status").textContent =
        "Карта недоступна. Проверьте сеть; анализ и Trainer доступны отдельно.";
  }
}
$("atlas-track").addEventListener("change", () => {
  layouts();
  show();
});
$("atlas-layout").addEventListener("change", show);
$("atlas-mode").addEventListener("change", () =>
  map.render($("atlas-mode").value),
);
$("atlas-in").addEventListener("click", () =>
  map.view.setZoom(map.view.zoom * 1.2),
);
$("atlas-out").addEventListener("click", () =>
  map.view.setZoom(map.view.zoom / 1.2),
);
$("atlas-fit").addEventListener("click", () => map.view.fit());
window.addEventListener("pagehide", () => map.dispose());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    map = new MapContext($("atlas-canvas"), () =>
      map.render($("atlas-mode").value),
    );
    show();
  }
});
try {
  atlas = await loadAtlas();
  $("coverage").textContent =
    `Atlas ${atlas.atlasVersion}: ${atlas.tracks.length} трасс, ${atlas.tracks.reduce((n, t) => n + t.layouts.length, 0)} конфигураций. Справочные контуры — ${atlas.tracks.reduce((n, t) => n + t.layouts.filter((l) => l.geometry).length, 0)}; подтверждённых телеметрических привязок — 0.`;
  $("atlas-track").replaceChildren(
    ...atlas.tracks.map((t) => option(t.id, t.name)),
  );
  $("atlas-track").value = "sebring";
  layouts();
  await show();
} catch {
  $("atlas-status").textContent =
    "Каталог недоступен. Trainer и анализ телеметрии доступны через навигацию.";
}
