# Проверки Phase 1

Дата: 20 октября 2026 года. Проверяется новая единая основа с synthetic DEMO; не повторный аудит реальных записей.

Итог: **239 pass / 0 fail / 3 skip** из 242 unit/baseline/domain tests; **12/12 Chromium** и **12/12 WebKit** browser-сценариев; оба base и security/provenance checks успешны.

## Команды и область

| Команда | Область |
| --- | --- |
| `npm test` | Baseline R5.2, новая state/source/playback foundation и production synthetic unit assertions; private assertions вынесены локально |
| `npm run test:e2e` | Chromium: shell, DEMO, A/B, range/camera, playback, missing channel, Driving Lab, события, routes, lifecycle, пути |
| `APEX_BROWSER=webkit … npm run test:e2e` | Те же сценарии и размеры в отдельном WebKit runtime |
| `npm run check:security` | Engine hashes, UI/source boundary, CSP и отсутствие main UI Worker/import обходов |
| `npm run check:provenance` | Portable: immutable copies и locked dependencies; дополнительно 604/60 original hashes, HEAD/status при APEX_PRODUCTION_ROOT/APEX_REFERENCE_ROOT |
| `npm run build -- --base=/apex-lab/` + `npm run check:build` | Один static HTML entry, relative assets, manifest hashes, отсутствие personal paths/DB/JSX |
| `npm run build -- --base=/` + `npm run check:build` | Корневой base с теми же static правилами |

Точные результаты завершённых запусков — `evidence/unit.log`, `browser-acceptance.json`, `browser-webkit.json`, `source-integrity.json`, `build-checks.log` и `security.log`. Эти артефакты локальные, исключены из Git. Итоговая таблица также включена в `PHASE-1-REPORT.md`.

## Повторяемый WebKit

Браузер устанавливается внутри нового проекта, без системного кэша:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/playwright" TMPDIR="$PWD/tmp" \
  node node_modules/playwright/cli.js install webkit
APEX_BROWSER=webkit PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/playwright" \
  TMPDIR="$PWD/tmp" npm run test:e2e
```

Chromium использует Playwright browser из project-local cache; системный Chrome можно выбрать явно через APEX_BROWSER_CHANNEL=chrome. Harness удаляет только свой профиль после завершения. Baseline path читается без записи; `APEX_REFERENCE_ROOT` позволяет задать другую read-only копию **того же R5.2**. Без reference pack выполняются все функциональные проверки и responsive snapshots текущего UI; reference comparison явно отмечается skipped. Его нельзя подменять предыдущей ревизией.

## Визуальная проверка

Matched baseline/current screenshots: Track Map 1440×900 и 390×844; Pit Wall и Driving Lab 1440×900. Дополнительно проверены layout/overflow и итоговые CSS размеры при 844×390 и 768×1024. WebKit пишет отдельные файлы в `.impeccable/review/webkit/`, Chromium — в `.impeccable/review/`.

Motion отключено для сравнения геометрии. Скриншоты открыты и просмотрены; одноимённые состояния относятся к одному synthetic A/B/cursor. Десять исходных CSS перенесены без изменения; отдельный foundation.css исправляет только высоту четырёх native select до 44 px. Все снимки — DEMO, без DriverName/SteamID и исходных профилей.

Functional text в проверенных controls ≥11 CSS px. Символ события 26 px, hit target ≥44 px на достаточном масштабе. В overview события скрываются согласно R5.2; проверять размеры до выполнения условий отображения некорректно. Отсутствие pageerror проверяется вместе с состоянием и действиями.

## Ограничения

- Три исходных unit-теста private oracle пропущены: исходные assertion bodies с измеренными частными числами вынесены вне Git. Для локального запуска нужны APEX_PRIVATE_TESTS и APEX_BROWSER_ORACLE; synthetic assertions сохранены. Шесть authentic DuckDB повторно не импортировались. Доказательства Phase 0 не заменяют проверку будущего нового native UI.
- Python regression/desktop e2e не запускались: Python и его oracle не менялись и не входят в новый runtime. Полная проверка реальной интеграции относится к отдельным следующим фазам.
- Context-level сеть наблюдалась в DEMO. Workers не запускались, SW blocked в harness и не зарегистрирован приложением. Нельзя расширять результат на ещё не подключённые native/SW операции.
- WebKit на Mac не закрывает физический iPhone, VoiceOver, Windows/Edge, файловый picker на устройствах, PWA secure origin/install/update и память после длительных реальных сессий.
- Снимки с reduced motion не доказывают анимацию. Оригинальные React Bits/Anime assets сохранены по hashes; полный motion walkthrough отдельно не сертифицирован.
- Один Impeccable detect вернул 6 предупреждений контраста и 1 advisory. Его static предположения о чёрном тексте/белом body расходятся с actual CSS в браузере. Исходный результат сохранён, ignores не добавлялись. Полная WCAG-сертификация не заявляется.
- Предварительная проверка R5.2 UI не означает readiness for publication. Отдельным заданием разрешён secure source checkpoint; это не разрешение deployment или Phases 2–6.

## Исправленные дефекты новой основы

1. Сборка ловит ошибки ESM graph до замены dist; top-level await исходных islands поддерживается.
2. Точный distance seek не теряется на обратном synthetic mapping.
3. Immutable event arrays не нарушают инварианты proxy state.
4. Вложенная запись playback не обходит канонические команды.
5. На паузе HUD не переписывается каждый кадр; финальный кадр EOF доставляется.
6. Унаследованные 20px WebKit select motion/sector-select/alignment/rate исправлены до 44px отдельным правилом в конце каскада. Actual bounds проверены в обоих браузерах на четырёх размерах; appearance:auto и CSP сохранены.

Пороги production/fixtures и assertions baseline ради прохождения не ослаблялись. Повторные запуски выполнялись после конкретных исправлений либо для второго браузера/другого base.

## Переносимость security checkpoint

Актуальные команды Linux/Codespaces/Codex Cloud — в CLOUD-DEVELOPMENT.md. Отдельные public-redacted записи provenance описывают только docs и optional private tests; численные runtime модули и утверждённый UI не менялись. Три локальные функции сохраняют исходные assertions без изменения. Наличие конфигурации CI не считается успешным remote run: его статус подтверждается по GitHub Actions.

## Phase 2 — native import

`npm test` сохраняет Phase 1/domain regression и добавляет import-controller, RecordingSource, tagged cursor без mapping, безопасный HTML и исходный AnalyzerWorker lifecycle. Таймауты проверяются под контролируемыми таймерами; ожидание 60 реальных секунд не требуется. Три прежних private-oracle теста без локальных env явно skip.

`npm run test:import:e2e` использует Playwright и закреплённый DuckDB-Wasm. Только dev-only генератор на Node/Wasm записывает synthetic SQL-fixture внутри tmp/, считывает его в тест и удаляет. Runtime импортирует через настоящий browser File и исходный Worker, а не через JSON-отчёт. Все metadata fixture явно тестовые; APEXDataKind=synthetic сохраняется до UI. Generated DB не коммитятся.

Браузеры:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/playwright" node node_modules/playwright/cli.js install chromium webkit
npm run test:e2e
npm run test:import:e2e
APEX_BROWSER=webkit npm run test:e2e
APEX_BROWSER=webkit npm run test:import:e2e
```

`APEX_BROWSER_CHANNEL=chrome` выбирает установленный Chrome вместо bundled Chromium. Chrome и WebKit — автоматические проверки, не физический iPhone.

Для локальной проверки приватных файлов задать существующие внешние read-only пути (не копировать данные в проект):

```sh
APEX_REAL_BROWSER=1 \
APEX_AUDIT_ROOT="$LOCAL_PHASE0_AUDIT" \
APEX_LMU_DATA_ROOT="$LOCAL_LMU_DATA" \
APEX_BROWSER_ORACLE="$LOCAL_PYTHON_ORACLE" \
npm run test:import:e2e
```

Audit root должен содержать evidence/database-audit.json и evidence/browser-native-audit.json из Phase 0. Data root — существующий каталог записи. Oracle root — manifest.json с существующими oracle paths. Без oracle независимая проверка явно skip; baseline native parity проверяется отдельно. CI и Codespaces не получают эти переменные и файлы.

Результаты и screenshots находятся только в ignored evidence/phase2/{chromium,webkit}. Private screenshots не публикуются. Сеть наблюдается на уровне browser context, включая Worker requests; разрешены локальные GET и local blob reads. Проверяются отсутствие POST/external/query payload, raw DB caches, IndexedDB и Service Worker registrations. Ошибки и снимки настоящих записей остаются локальными.

### Результат локальной приёмки Phase 2

21 октября 2026: portable 255 pass / 0 fail / 3 private skips; opt-in с сохранёнными исходными private assertion bodies 258 pass / 0 fail / 0 skip. Native suite 19/19 Chromium и 19/19 WebKit, включая шесть real файлов и сравнение с native/Python baseline. DEMO 12/12 в обоих браузерах с approved reference. Подробности: ../PHASE-2-REPORT.md.

В native harness намеренно блокируются Worker/Wasm assets. Только ожидаемый Failed to fetch при этом fault injection отмечается отдельно; остальные pageerrors должны отсутствовать. Test navigation не делает full reload текущего Sessions URL, чтобы не потерять in-memory source в WebKit.

## Phase 3 — настоящее сравнение A/B, 28 октября 2026

Текущая версия 0.15.0-phase3. Прежние разделы выше — исторические результаты отдельных фаз, не замена этой приёмки.

| Проверка | Фактический результат |
| --- | --- |
| Portable unit/domain | 269 pass, 0 fail, 3 явных private skips; 272 total |
| Local private assertions | 272 pass, 0 fail, 0 skip |
| Phase 3 Chromium / WebKit | По 15 групп: 9 synthetic journeys и 6 authentic native imports |
| Native import regression | По 13 synthetic групп в Chromium и WebKit |
| R5.2 DEMO regression | По 12 групп в Chromium и WebKit с approved read-only reference |
| Static bases | Build/check:build для / и /apex-lab/ |
| Source integrity | 604 production и 60 R5.2 files unchanged; 133 preserved/redacted copies, 10 CSS, locked dependency graph |
| Private dataset | 9 исходных файлов: SHA-256, размер и mtime неизменны |

### Воспроизведение

После setup/build и установки browser binaries:

```sh
npm run test:analysis:e2e
APEX_BROWSER=webkit npm run test:analysis:e2e
```

Настоящий A/B File/Worker путь проверяется только локально и явно:

```sh
APEX_REAL_BROWSER=1 \
APEX_AUDIT_ROOT="$LOCAL_PHASE0_AUDIT" \
APEX_LMU_DATA_ROOT="$LOCAL_LMU_DATA" \
APEX_BROWSER_ORACLE="$LOCAL_PYTHON_ORACLE" \
npm run test:analysis:e2e
```

Для WebKit добавить APEX_BROWSER=webkit. Не задавать private env и не загружать данные в CI/cloud. Результаты и снимки: ignored evidence/phase3/{chromium,webkit}; тестовые browser profiles — tmp/ внутри приложения. App server не раздаёт эти каталоги.

### Уровни доказательств

Public synthetic SQL-fixtures проверяют настоящий native импорт, но исходный Worker не допускает их к certified A/B. Этот guard сохранён. Новый test-only synthetic transport выдаёт явно synthetic профили, вызывает оригинальный compare и проходит adapter/AppState/UI. Harness разрешает ровно два fixture modules только на своём локальном origin; они не включены в dist. Он не подменяет доказательство authentic pipeline.

Private приёмка открыла все шесть original записей без копирования. Для S2 и S4 сравнила каждое числовое значение обоих профилей и comparison, включая distance/time/signals/delta, policy, origin, coverage и plateau. 169153 и 166932 числовых сверки; 64 и 41 missing masks. Максимальное отклонение 0 в обоих браузерах при прежнем допуске 1e-10. Все 23 lap validation совпали с Python. Oracle хранит более быстрый круг как A; для запрошенного обратного порядка переставлены роли A/B и инвертирован знак reference delta, сетка/маски/допуск не менялись.

Реальные S1/S3/S5 остаются импортированными без пары; S6 имеет один eligible lap и также не получает A/B. Незачётные/partial/pit сегменты не становятся допустимыми ради UI. Recorded full Lap Time и common-distance delta проверены раздельно. Полные private массивы и записанные численные профили не публикуются.

### UX, lifecycle и производительность

Проверены Overview/Pit Wall на 1440×900, 1280×720, 768×1024, 390×844, 844×390. Нет horizontal overflow; функциональный текст не меньше 11 CSS px, видимые native controls не меньше 44 px. Desktop/mobile screenshots просмотрены. DEMO reference сохраняет компактные события, Auto-fit, Follow, силуэты A/B, три Driving Lab tabs и один playback. View changes сохраняют canonical cursor; на паузе HUD имеет 0 DOM mutations.

Проверки включают точный seek, нелинейный B time↔distance, speed ×3.6 один раз, series/channel/range, смену A/B/sign, gaps, plateau, missing steering/speed, invalid mapping, cancel/retry, failed comparison, stale pair/source response, repeated mounting, return to DEMO и release. REAL вне mapping возвращает null, без endpoint clamping. Валидация grid coverage не соединяет скрытые между узлами разрывы: partial status и interval delta учитывают continuityBreaks.

В обоих браузерах 0 неожиданных pageerrors и 0 запрещённых сетевых запросов, включая Worker. Native fault-injection suite отдельно учитывает ожидаемую ошибку блокированного Wasm. Storage/Worker teardown assertions пройдены.

Измерения одного финального локального запуска, с накладными расходами Playwright и параллельной DEMO suite:

- Import + готовность analysis: Chromium 0.62–1.57 с, WebKit 1.08–1.83 с по шести файлам; largest S6: 1.57/1.83 с, без допустимой пары.
- Profile/compare request для S2/S4: Chromium 166/154 мс, WebKit 151/120 мс; Worker comparisonMs 21.3/23.4 и 16/18 мс соответственно.
- Aligned grid payload 222336 байт; два активных профиля 23570/23196 samples. Это размеры выбранных данных, не полная стоимость Worker structured clone.
- 100 принудительных вызовов updateRealCursor на паузе: 31.5/35.6 мс Chromium, 40/53 мс WebKit; обычный paused loop не переписывает HUD. Pit Wall main содержит 259 DOM элементов, а не по элементу на sample.
- Chromium usedJSHeapSize около 55.6/87.8 MB для всей вкладки после соответствующих journeys. Это приблизительный снимок, не retained-memory/leak proof. WebKit этот счётчик не предоставляет.

Новые произвольные performance thresholds не вводились. Длительная память, максимальный разрешённый размер записи на слабых устройствах и physical iPhone остаются непроверенными. Автоматический WebKit на Mac не заменяет аппаратную приёмку. PWA/offline и Windows packaging вне этой фазы. Фактические clean-clone/CI результаты фиксируются в Phase 3 PR и отчёте handoff; локальный успех не объявляется GitHub Actions успехом.
