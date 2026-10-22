# APEX LAB · Unified Application · Phase 2

Версия **0.14.0-phase2**. Одобренный интерфейс Revision 5.2, один AppState и один владелец playback. Локальный `.duckdb` открывается существующим Worker: доступны метаданные, все обнаруженные круги, причины ограничений и выбор допустимой A/B пары.

Реальные графики, playback/HUD, траектории, Coaching и экспорт отчётов **ещё не подключены**. DEMO сохраняет полный синтетический опыт R5.2 и явно переключается отдельно.

## Запуск

Node.js ≥22; закреплённая среда — Node 22. В GitHub checkout приложение находится в `source/`. В независимом локальном checkout package.json находится в корне.

```sh
# Только в GitHub clone:
cd source

npm run setup:cloud
npm run dev
```

Открыть `http://127.0.0.1:4190/apex-lab/`. Сессии → Выбрать .duckdb. Запись остаётся в памяти вкладки, файл не отправляется на сервер и не сохраняется в браузерной базе. Доступен явный переход обратно в DEMO.

## Проверки

```sh
npm test
npm run check:security
npm run check:provenance
npm run check:publication
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/playwright" node node_modules/playwright/cli.js install chromium
npm run test:e2e
npm run test:import:e2e
```

Последняя команда генерирует synthetic DuckDB из SQL с APEXDataKind=synthetic через локальный Node/Wasm пакет и проверяет настоящий File/Worker pipeline. Личные базы не нужны. Подробности и opt-in проверки: [TESTING](docs/TESTING.md).

## Границы

- .duckdb от 12 КиБ до 256 МиБ, исследованная схема LMU Version 1. ZIP распаковывается пользователем; JSON здесь не поддерживается.
- Рабочий фильтр проверяет часы, покрытие и pit-state; это не спортивная сертификация LMU.
- Наличие канала, нормализация и доступность его графика — разные состояния. Missing = null.
- Никаких runtime CDN, аналитики, аккаунтов, telemetry upload, raw database persistence или backend.
- Производственные алгоритмы и 10 исходных CSS R5.2 защищены provenance-хешами.

[Архитектура Phase 2](docs/PHASE-2-ARCHITECTURE.md) · [Подготовка Phase 3](docs/PHASE-3-READINESS.md) · [Облачная разработка](docs/CLOUD-DEVELOPMENT.md) · [Лицензионный план](LICENSING-PLAN.md).

Старый публичный beta snapshot остаётся в корне GitHub репозитория. Его `main`/Pages не обновляются этим исходным feature PR. Новая публикация — отдельный draft PR; автоматического deployment нет.
