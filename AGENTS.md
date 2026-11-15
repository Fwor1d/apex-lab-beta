# APEX LAB — GitHub checkout

- Новый рабочий проект находится в `source/`. Читать `source/AGENTS.md`, `source/PRODUCT.md` и `source/DESIGN.md` до изменения кода. Общение и UI — русский; код — английский.
- Root static beta сохранена для истории. Не заменять её результатом build и не возвращать старый UI в новое приложение. Root CI/devcontainer — конфигурация разработки source/.
- Node>=22. Команды из source/: npm run setup:cloud, npm test, npm run check:security, npm run check:provenance, npm run check:publication, npm run test:e2e, npm run test:import:e2e, npm run test:analysis:e2e, npm run test:trajectory:e2e.
- Запрещено выдумывать authentic telemetry, загружать private LMU файлы, изменять validated math без отдельного задания и тестов, добавлять скрытые удалённые runtime зависимости или удалять R5.2 UI. Один AppState и playback owner обязательны.
- Phase 4 candidate подключает прежний native-trajectory к карте в общем локальном кадре и единому B-time cursor. Geographic/yaw/events не установлены. Authentic local acceptance pending; Phases 5–6 не начинать автоматически. Не merge PR/force-push, не менять закрытые PR #1/#2/#3 и исторические ветки, main, Pages/deployment, видимость репозитория или DNS без отдельного задания. Сканировать staged файлы и всю outgoing историю перед каждым push.
- Все generated artifacts/cache/evidence внутри source/ и вне Git. Локальные personal skills не считать доступными в cloud. Hooks disabled.

- Phase 4 feature branch real-track-map-phase4 основана на real-ab-telemetry-phase3 b7e67101660589652e694cf6cc45ec8a6179101d. Финальный certified release tag запрещён до отдельной authentic acceptance. Native points/links неизменны, камера не меняет cursor/range.
