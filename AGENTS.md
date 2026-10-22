# APEX LAB — GitHub checkout

- Новый рабочий проект находится в `source/`. Читать `source/AGENTS.md`, `source/PRODUCT.md` и `source/DESIGN.md` до изменения кода. Общение и UI — русский; код — английский.
- Root static beta сохранена для истории. Не заменять её результатом build и не возвращать старый UI в новое приложение. Root CI/devcontainer — конфигурация разработки source/.
- Node>=22. Команды из source/: npm run setup:cloud, npm test, npm run check:security, npm run check:provenance, npm run check:publication, npm run test:e2e, npm run test:import:e2e.
- Запрещено выдумывать authentic telemetry, загружать private LMU файлы, изменять validated math без отдельного задания и тестов, добавлять скрытые удалённые runtime зависимости или удалять R5.2 UI. Один AppState и playback owner обязательны.
- Phase 2 подключает только native open к Sessions. Phases 3–6 не начинать автоматически. Не merge PR/force-push, не менять main, Pages/deployment, видимость репозитория или DNS без отдельного задания. Сканировать staged файлы и всю outgoing историю перед каждым push.
- Все generated artifacts/cache/evidence внутри source/ и вне Git. Локальные personal skills не считать доступными в cloud. Hooks disabled.
