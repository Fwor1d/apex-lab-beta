# APEX LAB — изолированный прототип Revision 5

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Пилот LMU, сравнивающий собственные записанные круги. В этом прототипе доступны только явно синтетические круги; реальный импорт и production-интеграция не подключены.

## Product Purpose

Три задачи: Обзор — итог и интервалы для исследования; Карта — позиция/камера/HUD; Pit Wall — подробное сравнение сигналов. У них один shared telemetry state, один cursorM, общий A/B/timeAt и единый playback. Driving Lab — отдельное учебное упражнение.

## Capabilities and Constraints

Три доступных synthetic laps, один disabled pit/partial. У круга3 нет steering. Speed/throttle/brake/steering/delta доступны; RPM/gear/tyres/fuel/setup отсутствуют. Один общий synthetic path для A/B, без выдуманных независимых записанных racing lines. Native spatial registration/реальная физика не заявляются.

A: cyan #73d3ff, круг, сплошная линия; B: amber #ffc870, ромб, штрих. Их true coordinates не смещаются ради разделения. Distance alignment сравнивает равную дистанцию, Time — равное elapsed time. Текущая скорость, time advantage по равной дистанции и общий lap result отдельны. Missing остаётся null/«Нет данных».

Follow включается немедленно на whole lap, поддерживает paused scrub/playback/sector/segment; pan отключает. Camera presentation не меняет telemetry. Resize пересчитывает и marker geometry, и подписи по текущей камере. Демо3сектора и8участков не официальные LMU.

Map и Pit Wall имеют разные presentation entries и DOM order, общий controller. Mobile переносит существующие DOM-узлы: Map scene→playback→tools/HUD→traces; Pit Wall tools→playback→traces→map context. Drawer/hover/pin/focus не сбрасывают context. Dashboard не содержит process arrows/wizard и не изображает real import.

## Motion

Оригинальные React Bits CometDial/SpotlightCard и Anime.js bundles с прежним provenance. Startup — короткое branded вступление один раз за browser session, sessionStorage apex-startup-r4; no RPM/no percent/no file processing. Reduced/off его пропускает. Manual progress demo доступно отдельно, unknown имеет ticks без0–100 и «ОЖИДАНИЕ». Motion preference apex-motion не меняет playback/data.

## Brand Commitments

Существующие graphite/lime tokens, системная типографика, русский UI. Основные пояснения14px, оси/подписи12px, функциональный минимум11px. Идентичность кругов отделена от смысла канала. Impeccable hooks disabled. Никаких CDN, uploads, backend/cloud runtime, внешних шрифтов или analytics. React Bits MIT+Commons Clause, не MIT-only.

## Evidence on Hand

R4 reports, unit/browser protocols и PNG. R3 backup и прежний ZIP сохранены. Production read-only. Independent review и высокий test count не означают пользовательского одобрения или device acceptance. Дальше только пользовательский просмотр.


## Revision 5 — функциональная интеграция

Новая модель данных: demoSource → один pedal-events detector → context adapter и общие события карты/графиков. Driving Lab использует источник A/B/ручной, медиану окон входа/выхода, минимум при полном покрытии и события пересечения порогов. Все данные synthetic, не LMU. Вход и замедление общие для прежних brakingCalculation и educational-estimator; ручные overrides сохраняются.

**Уточнение пользователя имеет приоритет:** три верхние вкладки «Редактор траектории», «Записанный путь», «Тормозной путь». Полный калькулятор только на третьей вкладке. Редактор сохраняет большую сцену слева и компактные настройки справа; источник и учебная оценка ниже. Вкладки сохраняют handles, source, context, overrides и estimation state. Записанный путь остаётся явно недоступным без регистрации.

Карта получила иллюстративный коридор в synthetic coordinate units, не метрах; для острых изгибов используется round stroke union. Мини-карта не получает события. Сектора/8 участков используют прежний timeAt, B−A и individual/cumulative, общую селекцию/камеру. Comprehensive map composition redesign не входит в R5. Production остаётся read-only.

## Revision5.1 · изолированный Track Map

Scope/range, navigation segment, global cursor, camera, alignment и selected event независимы. Map-first layout, компактные события из общего cache, один A/B dock. Numeric model и Driving Lab сохранены. Базовый R5 immutable snapshot в родительском пакете; production integration/publication/user approval не заявляются.
