# APEX LAB

В этой ветке сохранена прежняя опубликованная static beta. Исходники нового единого приложения **0.13.0-phase1**, с утверждённым интерфейсом **Revision 5.2**, находятся в [source/](source/README.md).

```sh
cd source
npm run setup:cloud
npm test
npm run dev
```

Preview: http://127.0.0.1:4190/apex-lab/. Работает synthetic DEMO; реальный LMU import в новый UI ещё не подключён. Главная ветка и существующий Pages не обновляются этой feature-веткой.

[Cloud/Codespaces setup](source/docs/CLOUD-DEVELOPMENT.md) · [Архитектура](source/docs/ARCHITECTURE.md) · [Licensing plan](source/LICENSING-PLAN.md) · [Third-party notices](source/NOTICE.md) · [Security checkpoint](source/docs/GITHUB-CHECKPOINT.md).

CI выполняет только проверки. Merge PR и deployment требуют отдельного решения.
