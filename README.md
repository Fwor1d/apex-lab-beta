# APEX LAB

В этой ветке сохранена прежняя опубликованная static beta. Исходники единого приложения **0.15.0-phase3**, с утверждённым интерфейсом **Revision 5.2**, находятся в [source/](source/README.md).

```sh
cd source
npm run setup:cloud
npm test
npm run dev
```

Preview: http://127.0.0.1:4190/apex-lab/. Работают synthetic DEMO, локальный LMU File → Worker → Sessions import и настоящий A/B анализ: Overview, Pit Wall, speed/brake/throttle/steering/delta, HUD и единый playback по измеренному времени B. REAL карта, новые советы и экспорт ещё не подключены. Главная ветка и прежний Pages этой feature-веткой не обновляются.

[Отчёт Phase 3](source/PHASE-3-REPORT.md) · [Облачная разработка](source/docs/CLOUD-DEVELOPMENT.md) · [Архитектура](source/docs/PHASE-3-ARCHITECTURE.md) · [Независимый обзор](source/docs/PHASE-3-REVIEW.md) · [Граница Phase 4](source/docs/PHASE-4-READINESS.md) · [Лицензии](source/LICENSING-PLAN.md) · [Сторонние notices](source/NOTICE.md).

Draft PR направлен в Phase 2; PR #1/#2 и main сохраняются. CI выполняет только проверки, без private recordings или deployment. Phase 4 автоматически не начинается.
