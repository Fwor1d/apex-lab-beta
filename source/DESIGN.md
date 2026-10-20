---
name: APEX LAB — изолированный прототип
description: Тёмный рабочий пульт для синтетического A/B-разбора и отдельного учебного упражнения
colors:
  bg: "#101311"
  surface: "#191d1a"
  raised: "#232a24"
  line: "#303830"
  text: "#f2f5ee"
  muted: "#a3afa5"
  lime: "#c9fc60"
  blue: "#83bafa"
  red: "#ff807c"
  yellow: "#f0cc76"
  purple: "#d2a8f9"
  throttle: "#66dfa6"
  delta: "#ddd9fa"
  primary-hover: "#dcff9c"
  instrument-ink: "#f2f5ee"
  instrument-muted: "#b0bcaf"
  instrument-line: "#465247"
  instrument-bg: "#121713"
  instrument-rim: "#758171"
  instrument-inner-rim: "#303b31"
  instrument-ticks: "#566353"
  instrument-numbers: "#c0ccba"
  instrument-accent-warning: "#ed756c"
  instrument-error: "#ffb0a6"
  instrument-button: "#1d261e"
  instrument-button-hover: "#2e3a2e"
  instrument-disabled: "#94a191"
  instrument-disabled-border: "#354035"
  instrument-disabled-bg: "#151b16"
  road-surface: "#2c342d"
  shadow-soft: "#0003"
  navigation-backdrop: "#0005"
  dialog-backdrop: "#0009"
  demo-bg: "#29291d"
  track: "#657066"
  region: "#f0cc7612"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "26px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline-mobile:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline-compact:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  section:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  chart-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.4
  field-value:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  map-metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "22px"
    fontWeight: 550
    lineHeight: 1.5
  pair-metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.5
  calculation:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "30px"
    fontWeight: 550
    lineHeight: 1.5
  brand:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "23px"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "-0.035em"
rounded:
  tag: "4px"
  notice: "6px"
  control: "8px"
  panel: "12px"
  dialog: "16px"
spacing:
  micro: "4px"
  tight: "6px"
  small: "8px"
  inline: "10px"
  gutter: "12px"
  compact-panel: "14px"
  base: "16px"
  panel: "20px"
  section: "24px"
  wide: "32px"
  empty-block: "48px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.bg}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.bg}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.raised}"
  button-selected:
    textColor: "{colors.lime}"
  input-field:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    typography: "{typography.field-value}"
  nav-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.lime}"
    rounded: "{rounded.control}"
    padding: "10px"
  mode-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.lime}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  panel-mobile:
    padding: "{spacing.base}"
  source-tag:
    textColor: "{colors.muted}"
    rounded: "{rounded.tag}"
    padding: "4px 8px"
    typography: "{typography.label}"
  demo-banner:
    backgroundColor: "{colors.demo-bg}"
    textColor: "{colors.yellow}"
    rounded: "{rounded.notice}"
    padding: "8px 12px"
    typography: "{typography.label}"
---

# APEX LAB — система оформления изолированного прототипа

## Overview

**Creative North Star: "Пульт гоночного инженера"**

Система сохраняет графитовый пульт APEX: спокойные тёмные поверхности, один лаймовый акцент управления, постоянные цвета каналов и системный шрифт. Плотность подчинена длительному разбору у симулятора; декоративная анимация не управляет данными.

Документ описывает оформление изолированного прототипа; для Revision 2 обновлены навигация, прибор и учебный редактор. Исторический review/finish-verdict.md относится к R1 и не подтверждает новые экраны. Режим поверхности — Operate, способ реализации — code-led. Значения frontmatter описывают prototype/styles.css и канальные цвета prototype/app.js, а не production CSS. Контекст и порядок сценария закреплены в PRODUCT.md; подробности R2 — в ../docs/. Исторические sidecar/surface brief могут отсутствовать в отдельном пакете.

**Key Characteristics:**

- Общий дистанционный курсор связывает схему, показания и графики.
- Источник, единицы и синтетический статус остаются рядом с результатом.
- Тональные панели, табличные числа, нативные поля и видимый фокус.

## Colors

### Primary

`lime` — лайм главного действия, активного раздела, выбранного управления и серии A на схеме. `primary-hover` — светлеющее состояние главной кнопки; выбранная вторичная кнопка сохраняет тёмную поверхность и лаймовую рамку.

### Secondary

`blue` — скорость, `red` — тормоз и ошибка учебного ввода, `throttle` — газ, `purple` — нормированный ввод руля, `delta` — дельта B − A. `yellow` обозначает серию B на схеме, предупреждение и демонстрационный результат; `region` — полупрозрачное выделение диапазона. Цвет канала на графике одинаков для A и B: B отличается штрихом. Это важное отличие от лаймовой/жёлтой схемы и легенды пар.

### Neutral

`bg` — основа страницы, поле ввода и внутренняя сцена; `surface` — панель и обычная кнопка; `raised` — активная навигация и hover; `line` — граница/ось; `text` — основной текст и курсор; `muted` — пояснения и шкалы. `track` — справочный/демонстрационный контур, не физическая ширина. `demo-bg` удерживает предупреждение на отдельном тоне. Значения палитры нормативно перечислены во frontmatter.

**The Data Color Rule.** Цвет всегда сопровождается названием сигнала, единицей и статусом источника. На графиках канал задаёт цвет, A/B различаются также сплошной и штриховой линией.

## Typography

Весь shell использует локальный системный стек frontmatter, без внешних шрифтов. У `h2`/`h3` жирность 700 следует стандартному browser bold; отдельного авторского `font-weight` для них нет. Числа получают `tabular-nums` в метриках, полях A/B, таблицах, показаниях и результатах расчёта. Отдельной моноширинной гарнитуры нет.

`headline` — основное название; `title` — раздел панели; `section` — подзаголовок; `body` — объяснение; `label` — единицы/служебная подпись; `chart-title` — название графика; `map-metric`, `pair-metric`, `calculation` — разные уровни чисел. Общий line-height 1.5 наследуется телом; SVG оси задают собственный font shorthand без line-height. Максимальная длина обычного абзаца — 72ch; в launch — 48ch.

Каскад: на ≤760px обычный h1 использует `headline-mobile`, а h1 внутри `main[class^=mode-]` — `headline-compact`. Это правило фактически применяется ко всем текущим маршрутам, поскольку render() всегда задаёт класс mode-*. В той же ветке metadata под h1 имеет 12px/1.45, h2 сцены — 18px. У компактного landscape h1 — 22px, описание заголовка скрыто. A/B metric: desktop 20px, mobile 18px, компактный landscape 16px. Бренд: 23px, mobile 20px. Launch h2: 24px, mobile 22px. Select A/B и числовые/search поля — 16px в мобильном каскаде. Заголовок и текст осей графика имеют 12px в SVG user units; mobile plot растягивается с 148 до 164 CSS px по высоте, поэтому итоговая видимая высота глифов зависит от SVG scale.

**The Readable Control Rule.** Основные пояснения остаются 14 CSS px, подписи графиков — 12 CSS px. Финальный размер определяется каскадом и преобразованием SVG; наличие декларации не заменяет измерение.

## Layout

Shell R2: sticky верхняя полоса (64px плюс safe-area inset), слева постоянная полоса иконок 72px, справа main с максимальной шириной 1900px. Main имеет отступ 24px; на ≥1700px — 32px. Базовая рабочая сетка — `minmax(0,1.1fr) minmax(0,1fr)` с gap 20px: сцена слева, разбор под ней, графики справа. На ≥1700px: `minmax(0,1.1fr) minmax(0,1.4fr) 280px`, разбор уходит в третью колонку. Режим «Карта» имеет отдельную сетку `minmax(0,1.7fr) minmax(280px,1fr)` и собственное размещение; не переносить на него автоматически расположение «Обзора».

На desktop раскрытая навигация имеет ширину 248px и накладывается на содержимое; рабочая сетка продолжает резервировать только 72px. На ≤1150px рабочая область становится одной колонкой: сцена, playback внутри сцены, разбор, графики. На ≤760px либо в компактном landscape (`max-height:500px` и `max-width:1000px`) постоянная полоса скрыта, тот же nav работает drawer шириной `min(280px,85vw)`. Верх — 60px, в компактном landscape — 48px; остаётся sticky. Основные мобильные отступы — `20px 16px calc(24px + env(safe-area-inset-bottom))`; landscape main — 12px, панели — 14px. Поздние R2 правила имеют приоритет над историческим каскадом. A/B остаются над сценой. «К сигналам» переводит фокус на первый график. Значения описывают CSS, не выполненную браузерную приёмку.

Отступы извлечены как наблюдаемая шкала, а не выдуманный строгий шаг: 4/6/8/10/12/14/16/20/24/32/48px. `--gap:16px` объявлен в :root, но фактические layout gaps заданы компонентами и не читают его. Панели desktop — 20px, расстояние крупных секций — 24px. Исторические ../design/design-system.md и sidecar относятся к R1; текущая навигация описана в ../docs/navigation-behavior.md.

## Elevation & Depth

Глубина тональная: внутреннее поле темнее панели, выбранная поверхность светлее, граница толщиной 1px. Рабочие панели не имеют box-shadow. Диалог получает `0 20px 64px #0008` и backdrop `#0009`; раскрытая навигация R2 — `8px 12px 32px #0006`. Spotlight — отдельный необязательный локальный presentation island; его исходный алгоритм не становится общим стилем панелей.

**The Tonal Depth Rule.** Рабочие панели разделяются тоном и тонкой границей. Тени оставлены диалогу и мобильной навигации.

## Shapes

Наблюдаемая шкала углов задана frontmatter: компактная метка, предупреждение/readout, управление/внутренняя сцена, панель, диалог. Тонкая непрерывная рамка относится к панелям и интерактивным полям; пустое состояние имеет штриховую рамку. Круглые маркеры схемы не показывают yaw. Линии используют `vector-effect:non-scaling-stroke`; пиксельная толщина контура не задаёт метры ширины трассы.

## Components

### Buttons

Основное действие — лаймовая поверхность с тёмным текстом, weight 700. Обычная кнопка — тёмная поверхность и тонкая граница; hover поднимает тон. Selected использует `aria-pressed=true` либо selected class. Минимальная высота кнопки/Select/summary — 44px; это min-height, не фиксированная height. Disabled — opacity .46 и cursor not-allowed. Общий focus-visible — outline 2px лаймом с offset 3px. Сниппеты sidecar сохраняют эти состояния.

### Chips

Метка источника — компактная рамка и muted текст, без имитации кнопки. Synthetic banner — отдельная жёлтая строка статуса. Метка «Демо» не означает верифицированную запись.

### Cards / Containers

Панель объединяет одну рабочую задачу; радиус/отступы берутся из frontmatter, без отдельного свечения. Scene, разбор и signals — группы одной рабочей области, не маркетинговая карточная сетка. Focus скрывает только разбор и сохраняет playback и графики.

### Inputs / Fields

Search/number — фон bg, рамка line, радиус control, min-height 44px. Select использует surface. Checkbox — 20×20px внутри label с min-height 44px; диапазон имеет min-height 44px. Labels стоят над A/B и основным каналом; ошибки расчёта выводятся текстом. Нативный select не требует ослабления CSP; существующая CSP прототипа отдельно содержит style-src 'unsafe-inline' и не наследует production-политику автоматически.

### Navigation

Шесть hash-разделов: dashboard, sessions, telemetry, atlas, lab, reports. Ссылки R2 имеют min-height 48px, padding `12px 16px`, active с aria-current=page и независимыми aria-label/title. На постоянной полосе текст скрыт, доступное имя сохранено; раскрытие показывает подписи поверх рабочей области. Кнопка меню сообщает aria-expanded. Backdrop/Escape закрывают меню с возвратом фокуса. Мобильный drawer использует inert и Tab-цикл; desktop раскрытие немодальное. Смена меню не сбрасывает рабочее состояние.

### Учебный редактор

Синтетическая дорога имеет собственные границы и заливку. Линия примера синяя штриховая, своя линия лаймовая сплошная; легенда дополняет цвет. Четыре HTML handles — 44×44 CSS px поверх SVG с координатами через screen matrix. Номер/подпись и отдельные кнопки выбора помогают управлению. Поля s/n, история и пресеты стоят рядом на desktop, ниже сцены на ≤1050px; на ≤760px поля идут одной колонкой. Дорожные SVG-подписи на mobile скрыты, имена handles остаются. Геометрия n=±64/±48 SVG unit и PCHIP — только учебная форма; полное описание и ограничения в ../docs/racing-line-editor.md.

### Синхронная рабочая область

Схема и все видимые графики читают один `cursorM`. Клик по схеме ищет ближайший синтетический sample через inverse SVG matrix, drag меняет pan. Диапазон X общий; стрелки графика двигают курсор на 10 м. Readout всегда с единицей. Пять доступных demo-каналов не означают наличие реальных данных: у круга 3 steering=null, круг 4 недоступен для A/B. Серии A/B включаются независимо.

### Motion

Оригинальные CometDial/SpotlightCard скопированы локальными bundles React Bits, provenance и MIT + Commons Clause License Condition v1.0 сохранены в assets/licenses. Anime.js загружается отдельно и лениво для opacity 0.65→1 при выборе региона (180ms, outExpo). Это presentation, не измерение времени. CometDial получает progress=null внутри отдельной instrument-оболочки. Внешняя шкала 0–9 декоративна, не RPM/процент. Состояния idle/running/complete/error и текстовые этапы управляются вручную; завершение не возникает по таймеру. Файл не читается. Основной текст прибора 14px, подпись шкалы 12px, кнопки/select min-height 44px; полный контракт — ../docs/loading-instrument.md. Выбор `system/full/minimal/off` хранится только под `apex-motion`; full учитывает явный выбор, system следует prefers-reduced-motion. Minimal/off пропускают emphasis и dashboard Spotlight. Visibility/pagehide/BFCache cleanup и generation guard сохранены. CSS reduced-motion задаёт 80ms linear для смены background/color; это отдельное наблюдаемое правило, не таймлайн данных.

## Do's and Don'ts

### Do:

- Сохранять один cursorM для схемы, playback, показаний и графиков; pan/zoom меняют только вид.
- Держать синтетическую маркировку, единицы, пропуски и ограничения рядом с числами.
- Сохранять общий X-range и независимую видимость A/B; подписи поддерживают цвет и штрих.
- На узких экранах держать playback сразу после сцены и сохранять доступный переход «К сигналам».

### Don't:

- Не объявлять демонстрационные времена, траекторию или анимацию телеметрией LMU и прогнозом выигрыша.
- Не переносить токены production из design/incumbent-DESIGN.md поверх извлечённых значений прототипа.
- Не менять оригинальную геометрию/spring React Bits ради имитации; сохранять provenance и лицензии.
- Не считать исторический ship R1 приёмкой R2 или подтверждением полной WCAG, физического iPhone, Windows и real LMU.

## Дополнение после R2 mechanical scan

Прибор использует перечисленные выше тональные оттенки графита, серо-зелёных рисок и приглушённого красного акцента. Это локальная instrument-палитра, не новые значения telemetry channels. 18px — существующий compact map/pair heading, 28px — placeholder/readout прибора. Эти ступени намеренны. Линия легенды `border-top:3px` — условное обозначение траектории, не декоративный край карточки. Не добавлены detector ignores.

Единственный `detect` для R2 вернул code2 с warnings/advisories. Сообщения о чёрном тексте на чёрном фоне и white body относятся к file-target render; фактические computed styles HTTP preview проверяются отдельным browser evidence. Это не clean scan и не полная WCAG-приёмка.

## Revision 3 · map-first workspace

Рефайнмент сохраняет графит/лайм, системную типографику, оригинальные React Bits/Anime bundles. Track workspace отделён в track-workspace.js/css; карта ведёт, traces dock поддерживает. При широком экране: основной canvas + мини-карта/компактное сравнение; playback снизу; graph dock справа. На≤1100px dock ниже карты. На телефоне HUD —3-колоночная компактная сетка, toolbar2×2, мини-карта внутри сцены, playback непосредственно под ней. Никакие отсутствующие каналы не имитируются.

Каналы имеют собственный44px popover trigger вместо accordion. Навигация72→248px остаётся overlay, hover/pin не меняют ширину карты. Background camera context приглушён, выбранный диапазон выделен A/B; при follow часть контекста закономерно за кадром. Geometry lengths показываются непосредственно над учебной сценой; условная time difference доступна там же после включения допущений. Новый status text не добавляет fake progress.

В этой Revision3 текущая реализация раздела R3 имеет приоритет над историческим описанием R1/R2 layout и старой декоративной шкалы0–9. Палитра/шрифт/tokens сохранены. Числовой инструмент теперь имеет ручную шкалу0–100, unknown без процентов; точный CometDial readout обновляется сразу, внешняя стрелка и деления лишь догоняют увеличение bounded180ms. При уменьшении и reduced-motion они меняются сразу. Основные layout/presentation правила находятся в track-workspace.css и estimation-ui.css.

Единственный mechanical detect R3 вернул code2:6 low-contrast сообщений file-target renderer и5 advisories (white body плюс18/28px ступени). Никакие ignores не добавлены. Эти file-render предположения сравниваются с реальными computed styles в HTTP preview; clean scan и полная accessibility-приёмка не заявляются.


# Revision 4 — действующие уточнения

Этот раздел заменяет противоречащие ему исторические R1–R3 описания; общий визуальный мир сохранён.

- Presentation entries: overviewHTML, mapWorkspaceHTML, pitWallHTML. Общий controller камеры и shared state; independent engines не вводятся.
- Новые намеренные identity tokens: `--lap-a: #73d3ff` (A, circle/solid), `--lap-b: #ffc870` (B, diamond/dash). Они применяются к lap identity, не означают величину канала. Семантика оси/единицы остаются подписанными; delta — один производный trace.
- Главная карта и mini используют один synthetic pointAt. Совмещённые A/B сопровождаются caption/legend; пользовательские coordinates ради UX не изменяются.
- `.analysis-dock` — отдельная зарезервированная строка. Pit Wall с hidden HUD имеет ровно две строки map-column: toolbar и map-stage. Alignment select полностью внутри toolbar и получает pointer hit.
- Mobile DOM reparent сохраняет объекты/слушатели и состояние; не создаёт второй playback. Pair picker сворачивается компактной кнопкой A/B, открывается для редактирования. Сцена Map выше вторичных settings.
- Основное пояснение привязки14px/20px, реальные CSS bounds проверены. Рамка focused main не рисует декоративную линию; интерактивные controls сохраняют focus-visible.
- Spotlight wrapper заполняет всю карточку, фон прозрачный; оригинальный bundle неизменен. Заголовок dashboard находится у верхнего padding, один основной CTA.
- Startup около1.1с +140ms fade, deadline island1.4с. Это визуальное вступление, не процент импорта. Оригинальный spring/geometry CometDial не менялись; wrapper lifecycle снимает timers/listeners/mount. Session flag отделён от данных.


# Revision 5 — функциональная интеграция и уточнение вкладок

Сохраняются graphite/lime, A/B cyan/amber, системный шрифт и R4 shell. Road asphalt #2c342d, illustrative edges #a3afa5. Ширина 40 synthetic coordinate units масштабируется вместе с камерой; линия пути 2 CSS px и края 1 nominal synthetic unit, не survey. Sharp offset self-intersections → round-join stroke union без ложных полигонов.

Map: две временные панели поверх сцены — сравнение времени и события/слои; одновременно открыта одна. При открытии доступны прокрутка и Escape. Значки A/B разнесены, соединены с точной координатой события; цвет+тип+буква, source в tooltip/list. На сложном переполнении доступен список. Ни одного нового постоянного горизонтального toolbar. Порядок scene/playback/traces закреплён также на 768/844.

Driving Lab: три верхние вкладки, полноценный калькулятор — «Тормозной путь». На desktop редактор сохраняет сцену + 300/320px editing controls. Контекст учебной оценки ниже сцены, без полного braking calculator. Calculator: источник/скорости слева, результат/учебная масштабная диаграмма/assumptions справа. На ≤800px — одна колонка. Формула и state одни. Ручной ввод помечен; авто-вход отображается 0,1км/ч, внутреннее значение не округляется. Модель времени на несовместимом входе даёт unavailable, не подставляет достижимую скорость.

Метки/цифры минимум11px, основные пояснения14px; SVG chart labels12px. Hooks disabled; оригинальные React Bits и Anime bundles неизменны. Нет новой identity/новых сетевых зависимостей.

## Revision5.1 · Track Map composition

Эта секция заменяет старую R5 композицию только Map. Header56px, compact tabs/source, analysis/alignment row, доминирующая сцена, A/Δ/B dock, playback. Camera44px слева; mini156×110 сверху справа; события справа; segment снизу слева. Короткая сцена получает horizontal camera. На≤760px segment/disclosures после playback. Selected card приwidth≤1100 илиheight≤800 — in-flow sheet под playback, иначе lower-right. Узлы перемещены, state общий.

A#73d3ff/B#ffc870 — identity. Brake#ff767f/full#70e4a4/min#f4c16f — тип. Backing#16202bee, selected#273844, edge#69736f, asphalt#242d30. Symbol26px, hit44px, triangle/arrow/diamond; solid/dashed outline. Нет persistent labels/long connectors.

Функциональные labels11px, обычные12px, пояснения14px, heading16px, delta26px/18px mobile, speed30px/24px mobile. Meter radius2px. Mobile pair toggle36px — известный P2. Computed contrast/типографика проверены; detector advisories не подавлены.
