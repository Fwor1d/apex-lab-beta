# Архитектура единого приложения · Phase 1

Дата: 20 октября 2026. Объём: foundation с DEMO. Это новый проект, а не изменение production-репозитория.

## Владельцы и поток данных

```text
app/index.html
 └─ app/app.js — один shell, hash routes и lifecycle представлений
     ├─ app/core/context.js — единственный экземпляр AppStore / source facade
     │   ├─ app/core/app-state.js — каноническое состояние
     │   └─ app/data/demo-source.js — synthetic источник
     ├─ app/core/playback.js — один scheduler воспроизведения
     └─ Overview / Track Map / Pit Wall / Driving Lab / Sessions / Reports

engine/ — production importer, Worker, quality, analysis, Coach, export,
           spatial guards и исходные тесты; пока не активируются из shell.
```

В `dist/` один `index.html`. Десять исходных CSS R5.2 сохранены; локальный foundation.css в конце каскада исправляет только 44px область касания четырёх native select, не меняя визуальную систему. Старые production app controllers, mobile HTML и Python runtime в него не вкладываются. R5.2 `model.js` и `demo-analysis.js` больше не являются UI API. Представления импортируют `core/context.js`; только DemoSource обращается к synthetic model. Educational braking calculation вынесен отдельно, без изменения формулы.

## AppState

Один канонический объект хранит route, выбранные A/B, режим, диапазон анализа, камеру, видимость слоёв, выбранное событие, состояние учебного редактора и playback. `state` — совместимый с R5.2 live facade этого объекта. Его вложенные изменяемые поля не являются вторым store. Immutable данные источника не оборачиваются в изменяемый proxy; snapshots для подписчиков копируются.

Pair selection — атомарная команда. Недоступная пара и одинаковые ID отклоняются. Смена пары останавливает playback, увеличивает generation, очищает selected event и прежний training context/analysis, сохраняя дистанцию в текущем источнике. Смена источника освобождает прежний source, очищает пару, камеру и зависимый контекст; `loaded=false`. Это foundation-команда, native switch в UI Phase 1 отсутствует.

Интервал анализа `range` отделён от `segmentId`, camera, fit/follow и панелей. Route и camera не сбрасывают пару, курсор или playback. Учебный редактор использует свой раздел в AppState, а не независимый таймер.

## Единственный курсор

`playback.cursor` — tagged union с **одним активным значением**:

- `{basis:'distance', value:d}` после точного ручного seek;
- `{basis:'time', value:t}` при продвижении времени круга B.

`cursorM` и `playback.timeS` в snapshot — производные selectors. Два независимых clock не хранятся. Вложенный playback недоступен для обходной записи; UI использует команды и facade aliases `playing`, `rate`, `cursorM`.

Это уточнение проекта контракта из Phase 0. Хранение только `timeS` с обратным бинарным поиском синтетического прототипа превращало точный seek 800 м в 800.00000016 м. Tagged value сохраняет точность пользовательского ввода без ослабления baseline-тестов. Во время playback канонична elapsed time B. Реальный time↔distance mapping, ambiguity и gaps остаются работой следующих фаз; синтетическая inverse-функция не считается импортёром.

Scheduler ограничивает шаг 0.1 с, применяет rate и завершает круг ровно на конце. Он обслуживает transition callback камеры/seek. Seek-transition и обычный advance не исполняются одновременно в кадре. `start()` идемпотентен; visibility/pagehide снимают RAF, resume не догоняет пропущенное время. UI updates идут при advance/seek; неподвижная пауза не переписывает HUD каждый кадр. Отдельные одноразовые layout RAF и React Bits/Anime effects не владеют телеметрическим временем.

## DataSource

Контракт описан в `app/core/contracts.d.ts`, runtime-проверка — `core/data-source.js`.

| Область | Значения/методы | Семантика Phase 1 |
| --- | --- | --- |
| Descriptor | id, mode, kind, coverage, label | DEMO = synthetic; real placeholder = telemetry-derived/unavailable |
| Контекст | laps, sectors, segments, metadata | Только исходный DEMO-каталог; неизвестная машина/трасса = null |
| Возможности | capabilities | Нет native import, geographic registration, yaw, gear/RPM |
| Сигналы | valueAt, datumAt, samples | m/s, ratio 0–1, signed normalized steering; отсутствие = null |
| Время | timeAt, duration, distanceAtTime | Synthetic для DemoSource; null для unavailable real |
| Положение | positionAt(lapId,distanceM) | Lap-aware подпись; общий synthetic путь R5.2, не независимые реальные A/B |
| События | events(lapId) | Исходные пороговые DEMO-правила, immutable cache на источник |
| Lifecycle | dispose | Освобождение event cache; будущие native resources здесь не создаются |

Presentation facade переводит m/s→km/h и ratios→проценты ровно на границе UI. Для training-context samples педали сохраняются как ratio — существующий контракт прототипа. Отдельный datum несёт value, unit, kind, status, reason, source и samplingBoundS. Null не преобразуется в ноль. `UnavailableRealSource.open()` явно возвращает ошибку PHASE_2_REQUIRED, а не демонстрационные данные.

Audit SessionRef/LapRef/PairRef и channel descriptors — целевой контракт для native-интеграции; Phase 1 не объявляет вымышленные imported sessions, eligibility или source verification. Минимальный descriptor/lap list достаточен для текущего synthetic UI. Реальный registry, bounded indexes, Worker results generations и metadata allowlist будут подключены отдельным заданием.

## Сохранённое production-ядро

Importer, `analysis.js`, Coaching Engine, Extended Analytics, report/export Worker, position/native-trajectory guards, portable profile contract и образовательные модули скопированы с сохранением относительных зависимостей. `check:security` и `check:provenance` проверяют их исходные hashes. Пороговые значения и SQL не правились.

Worker entry points в dist сохранены, но shell Phase 1 их не создаёт. Поэтому отсутствие Wasm-запросов в DEMO является ожидаемым результатом, а не доказательством native-импорта. Python oracle не переносился и не менялся. Тесты engine используют независимые fixtures исходника; реальные oracle checks без приватного input пропускаются явно.

## Сборка и безопасность

Locked dependencies установлены заново внутри проекта. Проверка ESM graph выполняется до генерации dist. DuckDB-Wasm vendor создаётся из закреплённого 1.32.0, selected eh/mvp assets локальны. Использование single-thread/importer READ_ONLY сохранено в engine, но его runtime не заявляется проверенным новым shell.

CSP сохраняет локальные script/style/connect/worker ограничения. В DEMO нет сетевой телеметрии, внешних шрифтов, CDN, backend или OPFS. Сервис-воркер нового shell не подключён: offlinePrepared=false. PWA/offline и cache upgrade нельзя считать завершёнными на основании этой фазы.

Static server допускает только loopback GET/HEAD и realpath containment. Baseline mount существует только внутри E2E harness; обычный сервер отдаёт dist. Все source/docs/private diagnostics исключены из runtime. Build manifest содержит SHA-256 каждого asset и явные nativeImportConnected=false/offlinePrepared=false.

## Актуализация Phase 2

Исторический граф Phase 1 дополнен действующим `RecordingSource` и import-controller. Полный текущий контракт и lifecycle: [PHASE-2-ARCHITECTURE.md](PHASE-2-ARCHITECTURE.md). `UnavailableRealSource` не является пользовательским импортёром. Запись без пары или без временного mapping остаётся доступна в Sessions; REAL аналитические маршруты явно закрыты до следующего этапа.

## Актуализация Phase 3

Действующие profile/compare adapter, B mapping и REAL presentation описаны в [PHASE-3-ARCHITECTURE.md](PHASE-3-ARCHITECTURE.md). Native open сохраняется; в Overview/Pit Wall больше не применяется прежнее общее unavailable Phase 2. Остальные spatial/Coach/export boundaries сохранены.
