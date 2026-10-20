# APEX LAB · Phase 1

Версия **0.13.0-phase1**. Одобренный интерфейс Revision 5.2, единый AppState и playback owner, изолированный synthetic DemoSource. Production telemetry engine сохранён; реальный LMU импорт к этому UI ещё не подключён.

Node.js >=22. Из каталога с этим package.json:

```sh
npm run setup:cloud
npm test
npm run dev
```

Открыть http://127.0.0.1:4190/apex-lab/. setup устанавливает locked dependencies и собирает dist. После изменения исходников: `npm run build -- --base=/apex-lab/`. Runtime — только статические файлы, Python/credentials/личные записи не нужны.

В репозитории GitHub новый исходник расположен в `source/`; прежняя static beta в корне сохранена. В самостоятельном локальном checkpoint приложение находится в корне проекта.

- `app/`: единственный UI shell; `core/`: AppState/playback/DataSource; `data/`: synthetic DEMO и unavailable real source.
- `engine/`: сохранённые production modules, Workers, contracts, geometry provenance и synthetic tests.
- `docs/`: архитектура, проверки, происхождение и ограничения.
- `dist/`, `evidence/`, `tmp/`, `.cache/`: локальные outputs, исключены из Git.

[Cloud/local setup и все команды](docs/CLOUD-DEVELOPMENT.md), [архитектура](docs/ARCHITECTURE.md), [проверки и ограничения](docs/TESTING.md), [notices](NOTICE.md), [план лицензирования](LICENSING-PLAN.md). Phases 2–6, merge и deployment автоматически не начинаются.
