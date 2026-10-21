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
