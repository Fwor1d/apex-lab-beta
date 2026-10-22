# APEX LAB

В этой ветке сохранена прежняя опубликованная static beta. Исходники нового единого приложения **0.14.0-phase2**, с утверждённым интерфейсом **Revision 5.2**, находятся в [source/](source/README.md).

```sh
cd source
npm run setup:cloud
npm test
npm run dev
```

Preview: http://127.0.0.1:4190/apex-lab/. Работает synthetic DEMO и локальный LMU File → Worker → Sessions import. Доступны метаданные, все круги и выбор допустимой A/B пары. Реальные графики, карта, playback, Coaching и экспорт ещё не подключены. Главная ветка и существующий Pages не обновляются этой feature-веткой.

[Cloud/Codespaces setup](source/docs/CLOUD-DEVELOPMENT.md) · [Архитектура](source/docs/ARCHITECTURE.md) · [Licensing plan](source/LICENSING-PLAN.md) · [Third-party notices](source/NOTICE.md) · [Отчёт Phase 2](source/PHASE-2-REPORT.md).

CI выполняет только проверки. Merge PR и deployment требуют отдельного решения.
