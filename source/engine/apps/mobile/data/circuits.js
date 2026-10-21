import { SEBRING_COORDINATES } from "./sebring/centerline.js";
import {
  projectCoordinates,
  createPolyline,
  circuitWindow,
} from "../src/geometry.js";

export const SEBRING_GEOMETRY = createPolyline(
  projectCoordinates(SEBRING_COORDINATES),
  true,
);
const anchors = {
  // Approximate geographic landmarks checked against OSM shape + WEC 2023 map.
  t1: { location: [-81.34877, 27.45064], length: 440 },
  t7: { location: [-81.35825, 27.45275], length: 390 },
  t17: { location: [-81.3576, 27.44943], length: 590 },
};
function cornerGeometry(id) {
  const anchor = anchors[id];
  const point = projectCoordinates(
    [anchor.location],
    SEBRING_COORDINATES[0],
  )[0];
  const nearest = SEBRING_GEOMETRY.nearest(point);
  return circuitWindow(
    SEBRING_GEOMETRY,
    nearest.distanceAlong - anchor.length * 0.61,
    anchor.length,
  );
}
// Only the geographic centerline is source-backed. Driving settings are educational.

export const CIRCUITS = [
  {
    id: "sebring",
    name: "Sebring International Raceway",
    shortName: "Sebring",
    layout: "wec-international",
    layoutName: "International · WEC / LMU",
    officialLengthM: 6019,
    geometry: SEBRING_GEOMETRY,
    roadWidthM: 14,
    provenance: {
      kind: "geographic-approximation",
      geometry: "OpenStreetMap centerline",
      units: "metres; local WGS84 projection",
      source: "track-atlas / OSM relation 7003292",
      license: "ODbL-1.0",
      boundaries: "approximate uniform 14 m corridor; not track limits",
      lapOrigin: "approximate OSM start/finish; not LMU lap-distance alignment",
    },
    corners: [
      {
        id: "t1",
        number: "T1",
        name: "Быстрый левый",
        subtitle: "Плавная загрузка передней оси",
        direction: -1,
        focus:
          "Сохраняй плавность: по мере увеличения поворота руля уменьшай давление на тормоз.",
        path: cornerGeometry("t1"),
        geometryStatus:
          "Окно и ориентир приближённые; не официальные границы поворота",
        defaults: {
          brakeStart: 24,
          entrySpeed: 205,
          apexSpeed: 112,
          gasStart: 64,
          release: 32,
          gasRamp: 30,
          line: 0,
          brakeIntensity: 80,
          apexPosition: 61,
          grip: 1.4,
        },
        limits: { entrySpeed: [165, 235], apexSpeed: [105, 165] },
      },
      {
        id: "t7",
        number: "T7",
        name: "Hairpin",
        subtitle: "Торможение и подготовка выхода",
        direction: 1,
        focus:
          "В шпильке сначала подготовь поворот, затем добавляй газ по мере распрямления руля.",
        path: cornerGeometry("t7"),
        geometryStatus:
          "Окно и ориентир приближённые; не официальные границы поворота",
        defaults: {
          brakeStart: 14,
          entrySpeed: 195,
          apexSpeed: 62,
          gasStart: 67,
          release: 44,
          gasRamp: 27,
          line: 0,
          brakeIntensity: 80,
          apexPosition: 61,
          grip: 1.4,
        },
        limits: { entrySpeed: [130, 225], apexSpeed: [48, 105] },
      },
      {
        id: "t17",
        number: "T17",
        name: "Sunset Bend",
        subtitle: "Длинная дуга и стабильный баланс",
        direction: 1,
        focus:
          "На длинной дуге избегай резких изменений педалей. Неровности реального Sebring здесь не моделируются.",
        path: cornerGeometry("t17"),
        geometryStatus:
          "Окно и ориентир приближённые; не официальные границы поворота",
        defaults: {
          brakeStart: 10,
          entrySpeed: 180,
          apexSpeed: 101,
          gasStart: 73,
          release: 30,
          gasRamp: 24,
          line: 0,
          brakeIntensity: 45,
          apexPosition: 61,
          grip: 1.4,
        },
        limits: { entrySpeed: [150, 230], apexSpeed: [86, 152] },
      },
    ],
  },
];

export const PARAMETERS = [
  {
    key: "brakeIntensity",
    label: "Пиковое давление тормоза",
    min: 20,
    max: 100,
    unit: "%",
    from: "Мягче",
    to: "Сильнее",
  },
  {
    key: "apexPosition",
    label: "Положение учебного апекса",
    min: 53,
    max: 69,
    unit: "% окна",
    from: "Раньше",
    to: "Позже",
  },
  {
    key: "grip",
    label: "Допущение: предел сцепления",
    min: 0.6,
    max: 1.8,
    step: 0.05,
    digits: 2,
    unit: "g",
    from: "Меньше",
    to: "Больше",
  },
  {
    key: "brakeStart",
    label: "Начало торможения",
    min: 10,
    max: 42,
    unit: "%",
    from: "Раньше",
    to: "Позже",
  },
  {
    key: "entrySpeed",
    label: "Скорость входа",
    unit: "км/ч",
    from: "Медленнее",
    to: "Быстрее",
  },
  {
    key: "apexSpeed",
    label: "Целевая скорость в апексе",
    unit: "км/ч",
    from: "Медленнее",
    to: "Быстрее",
  },
  {
    key: "gasStart",
    label: "Начало открытия газа",
    min: 48,
    max: 86,
    unit: "%",
    from: "Раньше",
    to: "Позже",
  },
  {
    key: "release",
    label: "Отпускание тормоза",
    min: 20,
    max: 60,
    unit: "% участка",
    from: "Быстрее",
    to: "Плавнее",
  },
  {
    key: "gasRamp",
    label: "Нарастание газа",
    min: 12,
    max: 40,
    unit: "% участка",
    from: "Резче",
    to: "Плавнее",
  },
  {
    key: "line",
    label: "Смещение линии",
    min: -12,
    max: 12,
    unit: "усл. ед.",
    from: "Внутрь",
    to: "Наружу",
  },
];
export const getCorner = (circuitId, cornerId) =>
  CIRCUITS.find((c) => c.id === circuitId)?.corners.find(
    (c) => c.id === cornerId,
  );
export const parameterBounds = (corner, param) =>
  corner.limits[param.key] || [param.min, param.max];
