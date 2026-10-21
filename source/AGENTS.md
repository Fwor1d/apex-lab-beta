# APEX LAB — правила unified Phase 1

- Общение, UI и документация — на русском; код и идентификаторы — на английском.
- Работать только внутри checkout приложения. В GitHub он находится в `source/`; в самостоятельном локальном checkpoint — в корне с package.json. Артефакты/cache/tmp хранить внутри него. Не писать в синхронизируемые iCloud/OneDrive папки.
- Production-оригинал, утверждённый прототип R5.2 и личные записи — внешние read-only источники. Облачная сборка их не требует. Не копировать и не загружать private LMU файлы в Git, CI, Codespaces или сторонние сервисы.
- Сохранять утверждённый UX Revision 5.2. Перед изменением UI читать PRODUCT.md и DESIGN.md. Не заменять его историческим production UI. Локальные skills на чужой машине не предполагаются; hooks Impeccable disabled.
- `app/core/app-state.js` — один AppState, `app/core/playback.js` — единственный владелец playback. Машина/HUD/графики читают тот же курсор. Камера не создаёт собственных часов и не меняет analysis range.
- DEMO явно synthetic. Не выдумывать authentic telemetry; не подставлять DEMO при отказе real source. Missing = null, единицы и происхождение обязательны.
- `engine/apps/` защищён исходными SHA-256. Не менять валидированные mathematics/importer/quality/Coach/export/Worker limits без отдельного задания и регрессионных тестов; не менять их ради UI или совпадения теста. Не ослаблять assertions/thresholds.
- Phases 2–6 и native-импорт в этот UI автоматически не начинать. Наличие Worker-кода не означает реальную интеграцию.
- Не вводить скрытые runtime CDN, удалённые шрифты, аналитику, upload, accounts, backend, OPFS или передачу телеметрии. npm/container/browser downloads разрешены для dev setup; runtime остаётся локальным static dist.
- React Bits (MIT + Commons Clause), Anime.js, DuckDB, OSM/ODbL и все notices/provenance сохранять. Не назначать собственному коду новую permissive или окончательную proprietary лицензию. См. LICENSING-PLAN.md.
- Lockfile versions/integrity сохранять. Node>=22; `npm run setup:cloud`, `npm test`, `npm run check:security`, `npm run check:provenance`, `npm run check:publication`, build/check для `/` и `/apex-lab/`. Браузер: install Chromium, `npm run test:e2e`; WebKit отдельно.
- CI использует только synthetic fixtures. Приватные assertions вынесены из публичных тестов; пропуск должен быть явно виден. Не загружать исходные oracle/записи, чтобы убрать skip. Политика не ослаблена; оригиналы сохранены локально.
- E2E без APEX_REFERENCE_ROOT проверяет все сценарии нового UI, но явно отмечает отсутствие side-by-side reference. С ним дополнительно проверяется именно R5.2. После UI-изменений осматривать screenshots. WebKit не заменяет физический iPhone.
- Static runtime: один HTML entry, относительные пути, local Worker/Wasm assets. Исходные JSX и личные данные не попадают в dist; generated dist/cache/evidence не коммитить.
- Публичный GitHub checkpoint разрешён только после аудита staged files и всех outgoing objects. Push только явной feature-ветки. Не force-push, не merge unrelated histories, не merge PR и не менять main/Pages/deployment/DNS автоматически.
- Старый static snapshot в корне GitHub сохранён как история опубликованной beta. Разработка Phase 1 — в source/. Не редактировать старый snapshot ради совпадения нового интерфейса.
- Не повторять успешные suites без новых изменений или конкретного риска. Непроверенные устройства, приватные oracle и ограничения среды записывать явно.
