# APEX LAB — отчёт Integration Phase 2

Дата локальной приёмки: 21 октября 2026. Версия **0.14.0-phase2**: новая функциональная фаза, без обновления dependency versions/integrity. Phase 1 сохранена отдельно. Следующие Phases 3–6 не реализованы.

## Что работает

Сессии → Выбрать .duckdb → browser File → существующий AnalyzerWorker/open → проверенная сессия → RecordingSource → единый AppState → Sessions Revision 5.2. Это native import, не загрузка JSON и не подстановка DEMO.

Показаны реальные allowlisted метаданные, все извлечённые сегменты, записанный Lap Time при наличии, исходный статус и подробные проверки качества. Отдельно раскрываются каналы/единицы, предупреждения и provenance. Отсутствующие значения остаются null. Сессия без допустимой пары остаётся успешно открытой.

A/B выбираются только среди разных кругов текущей сессии, удовлетворяющих исходным comparisonAllowed, validation.eligible, certified_valid, source_verified, pit=false и telemetry-derived kind. Кнопка «Поменять A и B» позволяет изменить роли даже при ровно двух кругах. Это рабочий фильтр, не независимая спортивная сертификация LMU. Пара пока задаёт контекст, а не готовый численный анализ.

## Состояние и ресурсы

FSM: idle → validating → importing → ready/partial; отмена/ошибка → cancelled/failed. Реальные этапы Worker показаны без фиктивных процентов. Неверные переходы отклоняются. Два уровня generation guards исключают запоздалые ответы. Замена файла освобождает предыдущий источник и сбрасывает пару, курсор, события, analysis context; unrelated preferences сохраняются.

Дубликат pending File не создаёт второй запрос. Cancel, повторный импорт, закрытие записи, DEMO и pagehide останавливают Worker через исходный terminate/stop с отклонением pending requests. После open DuckDB engine закрыт, профили хранятся только в изолированном application Worker. При закрытии записи File для retry также освобождается. Запись не сохраняется в localStorage, IndexedDB, OPFS или SW cache.

Один AppState и исходный playback owner сохранены. Tagged cursor distance/time с опорой на B не заменён вторым clock; REAL cursor/time остаются null до подключения проверенной mapping. loaded, inspectable lap, eligible pair и available analysis разделены.

## Идентичность, приватность и ошибки

Recording ID — полный SHA-256 выбранных байтов; Session ID и Lap ID — неизменные идентификаторы импортёра. Hash не доказывает подлинность LMU. CarName не превращается в выдуманную модель автомобиля.

Allowlist: track/layout/car/carClass/sessionType/recordingUTC. DriverName, SteamID, CarSetup, raw rows и telemetry arrays в UI descriptor не попадают. Импортированные строки экранируются. Тест с HTML-подобным TrackName отображает текст, не исполняет его. Ошибки фиксированные русские; raw stack/SQL/filename не показываются.

Проверены отсутствие файла, неверное расширение/ZIP/JSON, размер/заголовок, read failure, неподдерживаемая Version, corrupted DuckDB, отсутствующий clock, Worker/Wasm failure, deadline, cancellation/retry. Синтетическая native база сохраняет APEXDataKind=synthetic и видимую TEST маркировку; она не повышается до authentic/certified.

Формат: исходный .duckdb, исследованная LMU Version 1, **12 КиБ–256 МиБ**. Main thread читает только 12 bytes заголовка; SQL/hash/нормализация остаются в Worker. Header deadline 10 s, отдельная engine operation 10 s, request 60 s. Исходные guards GPS Time ≤500000, lap profile ≤200000 и positional extraction ≤50000 сохранены. Это пределы, не обещание производительности любого устройства на максимальном файле.

## Шесть private записей

Проверялись только в авторизованной локальной среде через picker/File/Worker. В Git/CI передаются synthetic fixtures; private files не копировались в проект.

| Alias | Обнаруженные сегменты | Круги для пары | Импорт / native baseline / Python validation |
| --- | ---: | --- | --- |
| S1 | 1 | нет | pass |
| S2 | 6 | 2, 4 | pass |
| S3 | 1 | нет | pass |
| S4 | 5 | 1, 2 | pass |
| S5 | 2 | нет | pass |
| S6 | 8 | 0; пары нет | pass |

Всего 23 сегмента. Метаданные, validation, source_verified/certified_valid, ID и SHA сверены с Phase 0. Lap validation дополнительно сверена с независимым Python oracle. Неполные/pit/ineligible сегменты доступны для просмотра. S3 и S6 не отклоняются из-за отсутствия сравнения. Полные координаты и профили в публичный отчёт не включены.

## Проверки

| Проверка | Фактический результат |
| --- | --- |
| Portable unit/domain | 255 pass, 0 fail, 3 explicit private skips; 258 total |
| Локально с сохранёнными private oracle assertions | 258 pass, 0 fail, 0 skip |
| Native import Chromium | 19 групп pass, включая шесть private записей |
| Native import WebKit | 19 групп pass, включая шесть private записей |
| R5.2 DEMO Chromium | 12/12 pass с read-only approved reference |
| R5.2 DEMO WebKit | 12/12 pass с read-only approved reference |
| Static bases | / и /apex-lab/ build + check:build pass |
| Provenance | 604 production, 60 R5.2 files unchanged; 133 preserved/public-redacted copies; 10 original CSS; locked graph unchanged |
| Private dataset integrity | 9 исходных файлов: SHA-256, размер и modification time неизменны |
| Browser privacy | 0 запрещённых запросов, 0 обычных pageerrors; storage/SW checks pass |

Один ожидаемый browser error при намеренном блокировании Wasm отделяется от обычных pageerrors; приложение завершается по прежнему bounded deadline и восстанавливает импорт. Тест не подавляет произвольные ошибки.

Размеры 1440×900, 390×844, 844×390, 768×1024: overflow и текст проверены, controls ≥44px. Реальные pair-select имеют explicit height для WebKit. Desktop/mobile screenshots просмотрены. Исходные 10 CSS R5.2, Track Map geometry, assets, HUD/markers/camera/Driving Lab в DEMO сохранены. New import.css содержит только новую поверхность.

Private evidence и screenshots остаются ignored. CI использует generated synthetic SQL с APEXDataKind=synthetic, Node/Wasm из lockfile и настоящий browser import. Нет второй production SQL реализации. No Python/private database requirement для portable setup.

## Неизменный engine

Переиспользованы client.js, worker.js, engine.js, importer.js, hash-entry.js и прежние зависимости анализа/quality/position/native-trajectory в engine/apps/browser-telemetry/src. Защищённые engine файлы не изменялись. SQL, timebase, distance alignment, missing, lap extraction, pit checks, Coach thresholds, native trajectory validation и export format сохранены. Native Worker open использует прежний read-only FileHandle pipeline.

Ни один исходный source project, утверждённый prototype или private dataset не редактировался. Dependency graph/integrity не изменялись. NOTICE, dependency licenses, React Bits/Anime.js/OSM provenance сохранены; новая лицензия оригинальному APEX LAB не назначалась. Нерешённые Commons Clause/ODbL/ownership вопросы остаются в LICENSING-PLAN.md.

## REAL и следующие фазы

Во всех REAL маршрутах неподключённые графики, скорость/педали/дельта/HUD, measured map, A/B trajectories, events, Coach, sectors и export заменены явным unavailable. Synthetic analytics не выдаются за импортированную запись. Возврат в DEMO — явное действие с teardown.

Phase 3 требует отдельного задания: source adapter для существующих profile/compare actions, availability результатов, B-time/distance mapping с gaps/plateaus, численная oracle regression и прежний один playback owner. Пространственная регистрация, Coaching и report export не становятся готовыми автоматически. См. docs/PHASE-3-READINESS.md.

Не проверены физический iPhone, Windows/Edge, длительная память на максимальных файлах, полноценный PWA/offline/device acceptance и фактический запуск пользовательского Codespace/Codex Cloud environment. WebKit на Mac их не заменяет.

## Git и облачная разработка

Рабочая local branch: codex/local-real-import-phase2, от независимого Phase 1 checkpoint 632b311a6ec56a20b99b408429e9f974ddfd842e. Remote branch: codex/real-lmu-import-phase2 от опубликованной Phase 1 61423968d1c0d98d916763c386ba8eae04b26fdf. Remote repository: https://github.com/Fwor1d/apex-lab-beta.

Истории independent local root и public repository не объединяются. Контролируемый alternate index отображает local app root в source/, а CI/devcontainer в корень GitHub; parent удалённого коммита — Phase 1 branch. Старый static snapshot и main сохраняются побайтно. PR направляется в codex/secure-foundation-cloud, остаётся draft; PR #1 не меняется. Force push, merge unrelated, merge PR, deployment и изменение Pages не выполняются.

Before push проверяются actual staging и все newly reachable blobs/commits через check:publication и Gitleaks с redaction. Чистый clone проверяет layout source/ и setup без Mac-specific references. Точные итоговые SHA, PR и actual CI run публикуются в handoff отчёте задачи; конфигурация workflow сама по себе не считается успешным remote run.

Local checkout с package.json: npm run setup:cloud, npm test, npm run dev. URL http://127.0.0.1:4190/apex-lab/; Sessions: /apex-lab/#sessions. GitHub clone: выбрать Phase 2 branch и сначала cd source. Node>=22. Cloud port 4190 оставлять private. Реальные базы не добавлять в cloud. Подробно: docs/CLOUD-DEVELOPMENT.md.

## Точный перечень новых/изменённых файлов относительно local Phase 1

- `.devcontainer/devcontainer.json`
- `.github/workflows/foundation.yml`
- `AGENTS.md`
- `PHASE-2-REPORT.md`
- `PRODUCT.md`
- `README.md`
- `app/app.js`
- `app/core/app-state.js`
- `app/core/contracts.d.ts`
- `app/core/data-source.js`
- `app/core/import-controller.js`
- `app/data/recording-source.js`
- `app/import.css`
- `app/index.html`
- `app/sessions.js`
- `docs/ARCHITECTURE.md`
- `docs/CLOUD-DEVELOPMENT.md`
- `docs/PHASE-2-ARCHITECTURE.md`
- `docs/PHASE-3-READINESS.md`
- `docs/TESTING.md`
- `package-lock.json`
- `package.json`
- `scripts/browser-acceptance.mjs`
- `scripts/build.mjs`
- `scripts/check-build.mjs`
- `scripts/check-security.mjs`
- `scripts/import-acceptance.mjs`
- `tests/fixtures/native-recording.mjs`
- `tests/fixtures/session-summary.mjs`
- `tests/unit/import.test.mjs`
