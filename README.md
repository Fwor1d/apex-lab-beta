# APEX LAB

Единое приложение **0.16.0-phase4 · candidate** с утверждённым UX **Revision 5.2** находится в [source/](source/README.md). Прежний static beta snapshot в корне сохранён без изменения его приложения.

```sh
cd source
npm run setup:cloud
npm test
npm run dev
```

Preview: http://127.0.0.1:4190/apex-lab/. Доступны DEMO, локальный File → Worker import, A/B анализ/HUD/единый B-time playback и native local-coordinate map с Fit/Follow/manual/mini-map. Authentic LMU spatial acceptance Phase 4 ещё pending; synthetic тесты не подтверждают реальные записи. Geographic registration, physical yaw и REAL spatial events отключены.

[Отчёт Phase 4](source/PHASE-4-REPORT.md) · [Архитектура](source/docs/PHASE-4-ARCHITECTURE.md) · [Матрица тестов](source/docs/PHASE-4-TEST-MATRIX.md) · [Review](source/docs/PHASE-4-REVIEW.md) · [Локальная приёмка](source/docs/PHASE-4-LOCAL-ACCEPTANCE.md) · [Cloud development](source/docs/CLOUD-DEVELOPMENT.md) · [Лицензии](source/LICENSING-PLAN.md).

Draft PR направлен в real-ab-telemetry-phase3 (b7e67101660589652e694cf6cc45ec8a6179101d). Закрытые PR #1/#2/#3, прежние ветки/tag, main и Pages не меняются. CI использует только synthetic fixtures, deployment отсутствует. Финальный certified tag и Phase 5 автоматически не создаются.
