# Phase 2: локальный импорт и границы данных

Версия приложения 0.14.0-phase2. Изменение версии обозначает новую функциональность; версии зависимостей и integrity lockfile сохранены.

## Поток

Browser File → `RecordingSource.open` → исходный `AnalyzerWorker.call('open', {file, method:'handle'})` → исходные `worker.js` / `engine.js` / `importer.js` → безопасный descriptor → единый AppState → Sessions R5.2.

Нового SQL-импортёра нет. Метаданные, единицы, часы, круги, quality/eligibility и исходные source_verified/certified_valid берутся из production engine. SHA-256 всех защищённых модулей проверяется прежними provenance/security scripts. Native open также извлекает ограниченный набор positional channels внутри Worker: это исходное поведение, не разрешение показывать реальные траектории.

## Владение и жизненный цикл

`import-controller.js` хранит только последний File для явного retry и поколение операции. Store хранит importStatus. `RecordingSource` владеет одним AnalyzerWorker и собственным токеном завершения. Смена файла сначала освобождает прежний источник. Обработчики старого поколения не публикуют ни progress, ни результат.

Переходы: idle → validating → importing → ready/partial; validating/importing → failed/cancelled. Повторное открытие начинает новый validating. Release завершённой записи → cancelled с причиной released. Некорректные переходы отклоняются AppState. Дублирующий вызов с тем же объектом File во время загрузки возвращает тот же Promise. Одинаковые байты после завершения можно импортировать снова.

Перед Worker читаются только 12 байтов заголовка; ожидание этого чтения ограничено 10 секундами. Worker повторяет валидацию независимо, считает hash порциями и применяет прежний общий deadline 60 секунд. Каждая операция движка ограничена 10 секундами. Формат .duckdb, 12 КиБ–256 МиБ; GPS Time ≤500000, профиль круга ≤200000, positional extraction ≤50000; остальные guards исходного импортёра сохранены.

После open DuckDB connection/file handle/движок освобождены; изолированный application Worker хранит нормализованные профили. Main thread получает summary и сохраняет только allowlisted descriptor. Cancel/replacement/DEMO/pagehide завершают Worker через исходный stop, который terminate-ит его и отклоняет pending requests. Неблокирующий release RPC сам по себе не может прервать зависший open, поэтому не заменяет teardown. File для retry очищается при release/DEMO/pagehide. База нигде постоянно не сохраняется.

## Разные виды доступности

- `loaded` означает успешный импорт сессии, даже если профилей нет.
- `hasLap`/`inspectLap` доступны для всех обнаруженных сегментов.
- `eligibleForPair` использует исходные validation.eligible, certified_valid, source_verified, pit=false, comparisonAllowed и kind. Это не новый численный фильтр.
- Пара требует два разных ID в текущей sessionId; отдельный метод отклоняет чужой sessionId. Если подходят менее двух кругов, a/b остаются null.
- `available` в Phase 2 для file source=false: реальные сигналы/аналитика ещё не подключены.
- Cursor остаётся `{basis:'distance'|'time', value:number|null}`. Для file source оба представления null; второго таймера и искусственного преобразования полного времени круга в дистанцию нет.
- Raw channel table presence, normalized quality и display availability указаны отдельно. Единицы взяты из MAPPING исходного импортёра. Из отсутствия значений не возникает ноль.
- `mode=real` обозначает путь локального файла. Если в нём APEXDataKind=synthetic, kind сохраняется synthetic, UI показывает TEST, source_verified/certified_valid не повышаются.

## Идентичность и приватность

RecordingRef.id = полный SHA-256 выбранного файла; SessionRef.id = неизменный session.id импортёра; LapRef.id = исходный строковый lapId. Пара относится к текущему SessionRef. Имена трассы/машины не используются как самостоятельная идентичность записи. Hash подтверждает совпадение байтов, не подлинность LMU.

В descriptor разрешены TrackName, TrackLayout, CarName, CarClass, SessionType, recordingUTC; исходный Worker уже исключает DriverName, SteamID, CarSetup. Дополнительные schema/raw rows/profiles/position arrays не сохраняются в UI. Имя файла не отображается вне нативного picker и не попадает в публичные ошибки. Импортированный текст экранируется, произвольные ошибки Worker заменяются фиксированными русскими сообщениями. Progress — реальные этапы Worker без выдуманных процентов.

## Изоляция представлений

В `app.js` file source имеет отдельную ветку существующего render: Sessions показывает настоящий descriptor, остальные маршруты — явное unavailable. DEMO функции графиков/cursor также имеют guard. Нельзя вызвать demo export или simulation через action при file source. Возврат в DEMO — отдельное действие с teardown. Исходные 10 CSS R5.2 и визуальные assets не изменены; новые стили импорта добавлены в import.css.

В build app/ переносится в корень dist, engine остаётся dist/engine. Только импорты адаптера переписываются на правильный относительный путь; модуль Worker и его зависимые URL остаются исходными. Проверяются оба base: `/` и `/apex-lab/`.

## Недоступно

Реальные A/B графики и дельта, timeline/playback/HUD, native trajectories, geographic overlays, события, Coaching, official sectors, setup interpretation, real report export и offline preparation. UnavailableRealSource сохранён как исторический тестируемый empty boundary Phase 1; пользовательский file flow использует RecordingSource.
