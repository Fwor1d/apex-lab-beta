# Phase 4 · архитектура локальных траекторий

Статус: **0.16.0-phase4 · implementation candidate**. Подключён существующий native pipeline; authentic LMU spatial acceptance ещё не выполнена для этой версии. Проверка публичного стенда не является проверкой частных записей.

## Источник и независимые допуски

`RecordingSource` сохраняет прежний AnalyzerWorker после FileHandle/READ_ONLY импорта. Импортёр, SQL, positional extraction, time/rowid/unit guards и protected `native-trajectory.js` не менялись. Действие `native-trajectory` вызывает исходный `buildNativePair` на уже удерживаемых Worker координатах. База не открывается повторно для карты, кадра или камеры.

Успешный импорт, inspectable lap, eligible telemetry pair, available comparison, отдельный native path, допуск native A/B наложения, geographic registration и physical yaw — разные состояния. `descriptor.capabilities.positions` означает хотя бы один доступный локальный путь. Оно не означает geographic/yaw/events capabilities. Графики и HUD сохраняются при отказе карты. При недопустимом наложении отображается A; если A отсутствует, допустим одиночный B. Два неподтверждённых кадра не накладываются.

`app/data/native-spatial.js` проверяет schema, source/session/lap identity, kind, candidate-metre, общий frame `[sessionId, origin]`, finite/null значения, размеры, порядок timestamps и структуру links. Повторная spatial quality модель не создаётся. Исходный engine выполняет проверку движения, скачков, метрики и формы пары. Его пороги не изменены. UI выводит только фиксированный allowlist причин, никогда raw error.message.

## Геометрия

Полные массивы исходных точек и links остаются неизменными. Основная карта и мини-карта используют одни prepared paths. SVG соединяет только соседние точки при `links[i] === true`; missing разрывает path. Ни замыкания Z, ни сглаживания, ни per-lap регистрации нет. Общий экранный перевод `(x, y) → (x, −y)` и равномерный viewBox — только presentation. Относительное смещение A/B сохраняется.

Единицы engine — `candidate-metre`. Физический абсолютный масштаб, север, CRS, географическая привязка, высота, yaw и официальные пределы трассы независимо не установлены. Карта не рисует выдуманную осевую линию, ширину дороги или OSM backdrop. Нейтральные круги A/B — позиции, не ориентация машины.

## Единственный курсор

Владельцы прежние: `app/core/app-state.js` и `app/core/playback.js`. Playback остаётся измеренным B-time. Формулы `measuredMapping`, comparison grid, delta и quality policy не изменены.

Для каждой роли путь такой:

1. Tagged cursor B-time → существующий `distanceAtTime(B, t)`; distance seek уже задаёт общую Lap Dist.
2. Та же общая дистанция → существующий `timeAt(A/B, d)` соответствующего профиля.
3. Исходный `nearestTime(native.samples, t, 0.051)` выбирает **записанную** точку. Это bounded temporal sampling, а не геометрическое nearest-point сопоставление и не интерполяция координат.
4. Вне native time span, внутри запрещённого link, при null x/y/distance или разрыве между canonical d и sampled d маркер скрывается. Нет endpoint clamping или экстраполяции.

Это сохраняет контракт native A-time → исходный отсчёт → Lap Dist и distance-matched B, не делая A-time вторыми часами: исходная точка A читается по времени A на уже выбранной общей дистанции. Не вводится квантование canonical cursor по координатам 10 Гц. На HUD/графиках остаётся точная дистанция курсора; native marker имеет явно указанную дискретность/границу 0,051 с. При неоднозначном mapping воспроизведение по-прежнему останавливается исходным Phase 3 механизмом.

AppState notifications обновляют REAL HUD/графические курсоры и native presenter. Камера не меняет время, пару или интервал анализа. Range highlight включает только записанные точки с валидным distance mapping, не придумывает пересечения границ интервала. Никаких новых timeImpact или spatial events.

## Camera presentation

`state.nativeCamera` хранит mode, follow role, zoom и центр кадра. `native-camera.js` вычисляет равномерный fit с padding 28 CSS px (для маленького viewport padding ограничен четвертью размера); zoom 1–24 — только удобство интерфейса, не научный порог. Вписываются полные видимые допустимые пути, включая разрывы, с общим масштабом. Прямая траектория с нулевым span одной оси безопасна; полностью вырожденные bounds отклоняются.

Follow A/B использует ту же sampled position; при missing сохраняется последний центр и выводится сообщение. Yaw не используется. Drag, wheel, touch pinch и стрелки переключают камеру в manual. Home/«Вписать» возвращает fit. Мини-карта показывает тот же кадр и viewport, её клик меняет только центр камеры. Listener/ResizeObserver принадлежат mount и освобождаются в destroy. Resize callbacks лишь отмечают dirty layout; DOM updates выполняются в прежнем application scheduler вне ResizeObserver delivery, без feedback loop WebKit. Новых RAF/timers нет, camera tween не добавлен — reduced motion не меняет измеренное время. Повторный render/переключение канала сохраняет камеру; смена source/pair сбрасывает её, смена видимости пересчитывает fit.

## Асинхронность и владение

- Анализ имеет прежнее source/analysis generation; spatial операция дополнительно получает spatial generation.
- Одна последовательная spatial queue и один deduplicated Promise на активную пару. Поздний ответ проверяет source epoch, spatial epoch и identity analysis.
- Смена пары/записи/DEMO, отмена анализа и release очищают trajectory и camera. Хранятся только активная пара и текущий bounded pending request; исторический cache массивов отсутствует.
- Отмена карты **логическая**: запрещает публикацию ответа и очищает ссылку UI, сохраняя сравнение. Исходный RPC физически завершается ответом либо существующим 60-секундным timeout; timeout завершает Worker. UI не обещает прерывания синхронного engine CPU по Cancel.
- Закрытие или замена записи использует прежний `stop()`/Worker terminate, который отклоняет pending calls. Возврат на вкладку с готовой парой не делает новый RPC.
- Source/analysis/trajectory identity защищает mounted presenter от stale callbacks.

## Производительность и приватность

Тяжёлая валидация исходного native pair остаётся в Worker. Проверка структуры и создание SVG strings выполняются один раз при подготовке/mount; highlight обновляется только при смене range. В кадре — бинарные time/distance lookups, два маркера, camera/viewBox, пять существующих readouts. DOM не создаётся на каждую точку. Геометрия не сериализуется в каждом кадре.

Синтетический workload отдельно измеряет подготовку engine, adaptation, lookup и готовность UI. Это не сертификат памяти и не benchmark физического телефона. Публичный test transport не входит в dist и не снимает native Worker authenticity guard. Source/provenance hashes, local assets/CSP, отсутствие upload/persistence/CDN и запрет private artifacts сохраняются. Отчёт apex-report остаётся distance-only.
