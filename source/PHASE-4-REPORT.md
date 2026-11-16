# APEX LAB · Phase 4 · Real Track Map candidate

**Версия 0.16.0-phase4. Локальная реализация и публичные синтетические проверки завершены. Authentic LMU trajectory acceptance — pending.** Дата проверки: 15 ноября 2026 UTC.

## 1. Результат

В едином приложении с UX Revision 5.2 подключён прежний native trajectory pipeline. Работают отдельные A/B пути, нейтральные позиции машин, общий курсор с графиками/HUD, Fit/Follow A/B, manual mouse/touch/keyboard camera, мини-карта и честные partial/unavailable states. DEMO сохранён. Новый импортёр, алгоритмы анализа, Coaching, экспорт или геопривязка не создавались.

## 2. Подтверждённая база и среда

GitHub: `Fwor1d/apex-lab-beta`, Phase 3 `real-ab-telemetry-phase3`, **b7e67101660589652e694cf6cc45ec8a6179101d**, стабильный tag `v0.15.0-phase3`. Исторические PR #1/#2/#3 закрыты без merge; `main` остаётся old beta **46c43e416fa0d283651aeb7ba06931098f293d66**.

Фактическая среда задачи — локальный macOS/Darwin 24.6.0 arm64 с Node 24.21.0, а не заявленное в brief Codex Cloud. Сохранена cloud data boundary: личные LMU/частный oracle Phase 4 не использованы. Исходный R5.2 был доступен read-only для DEMO comparison.

Локальный app-root checkpoint Phase 3 **3472f651ae2de1410c576d0bfc0406539690a300** имел отдельную историю. Все **231** tracked файла побайтно соответствовали source tree GitHub b7e6710 при отображении local root → remote `source/` (CI/devcontainer остаются на repo root). Разработка шла в `codex/local-real-track-map-phase4`; public candidate готовится в `real-track-map-phase4` прямым потомком b7e6710 через audited alternate index. Unrelated histories не объединяются.

## 3. Архитектура и синхронизация

`RecordingSource.requestTrajectory()` вызывает фиксированное действие `native-trajectory` существующего AnalyzerWorker. Worker использует сохранённый `buildNativePair`; база не открывается снова. Контракт проверяется отдельным `native-spatial.js`, который не переписывает spatial quality policy.

Один AppState и прежний playback owner. Измеренный B-time определяет общую Lap Dist; прежние timeAt(A/B) дают время каждой роли, исходный nearestTime выбирает native отсчёт в пределах 0,051 с. Нет интерполяции координат или endpoint clamping. HUD/графики сохраняют точный canonical cursor, маркеры отражают доступные исходные 10 Гц отсчёты. Полные arrays/links не изменяются.

Native eligibility независимо от telemetry comparison; при отказе карты анализ остаётся доступен. Source/pair/spatial generations, dedupe, логическая отмена, retry и terminate на release исключают stale paths и накопление истории пар. Пространственные summary в AppState не содержат массивов.

## 4. Камера и UX

Один общий native frame, равномерный Fit с padding, Follow только доступного A/B sample, manual pan/zoom, мини-карта того же пути/viewport. Камера не меняет range/time. При missing Follow сохраняет последний центр. Нейтральные концентрические маркеры и разнесённые подписи сохраняют A cyan / B amber при близких координатах. Native и DEMO поверхности разделены источником, без synthetic fallback REAL.

При resize DOM обновляется существующим scheduler, а не внутри ResizeObserver delivery; второй playback clock не введён. Camera/visibility/range controls имеют отдельные назначения. Геометрия подготавливается отдельно от движения двух маркеров.

## 5. Научные ограничения

`candidate-metre`, локальная кандидатная плоскость engine. Независимо подтверждённой CRS/географической регистрации, северного направления, physical absolute scale, yaw, высоты, официальной оси/ширины/лимитов трассы нет. Ни OSM fit, ни ICP, per-lap normalization, smoothing, artificial closure или extrapolation не применяются.

REAL spatial events, braking/apex detections, новые советы, timeImpact и gain prediction отключены. Существующий quality filter не является спортивной сертификацией LMU. Authentic spatial acceptance этой версии не подменяется историческими результатами Phase 3.

## 6. Проверки

| Suite | Итог |
|---|---|
| Public unit/domain | **288 pass / 0 fail / 3 private skips**; 19 новых native tests |
| DEMO R5.2 | **12/12 Chromium + 12/12 WebKit** |
| Native synthetic File/Worker import | **13/13 + 13/13** |
| Public synthetic A/B analysis | **9/9 + 9/9** |
| Phase 4 native presentation | **14/14 + 14/14** |
| Build/check `/` и `/apex-lab/` | passed |
| Security/provenance | passed, protected algorithms unchanged |
| Original-source integrity | **604 production + 60 R5.2**, без изменений |

Пять viewport проверены: 1440×900, 1280×720, 768×1024, 390×844, 844×390. Нет горизонтального page overflow; нативные controls ≥44 px. Снимки synthetic карты и DEMO просмотрены. Исходный reference доступен, но pixel-level certification не заявляется. Physical phones/VoiceOver/Windows и authentic Phase 4 данные не проверялись.

[Подробная матрица и performance](docs/PHASE-4-TEST-MATRIX.md). На synthetic 10252 native points один request; engine preparation 30,6/34,0 мс, adapter 0,8/1,0 мс, 20000 position lookups 15/12 мс (Chromium/WebKit). Test transport выполняет engine function внутри browser test context: это не benchmark реального Worker IPC/файла, FPS, SLA или сертификат памяти.

## 7. Review и исправления

Отдельные architecture/science, security/lifecycle, UX и test-coverage reviewers передали findings. Исправлены remount camera reset, причины отказа, partial empty-state, overlap A/B labels, long synthetic fixture overlap и недостающие assertions. Root исправил initial WebKit layout/ResizeObserver loop. Architecture/security повторно просмотрели финальные изменения. Coverage reviewer передал findings, но финальное завершение было прервано service limit; root закрыл замечания тестами. Полный независимый финальный coverage sign-off не заявляется. [Review](docs/PHASE-4-REVIEW.md).

## 8. Приватность, лицензии, публикация

Runtime — same-origin static app; нет upload, backend, CDN, аналитики, новых runtime dependencies, локальной персистентности записей или weakened CSP. Private files/oracle/arrays/screenshots не включены в Git. Lockfile package versions/integrities неизменны; меняется только root version. Protected engine и десять исходных CSS сохранены.

LICENSE/NOTICE/React Bits/Anime.js/DuckDB/OSM provenance не удалены и не заменены. Новая proprietary/permissive лицензия не назначена. Существующие Commons Clause/ODbL и ownership вопросы остаются в [LICENSING-PLAN](LICENSING-PLAN.md); Phase 4 новых assets/dependencies не добавляет.

Перед push обязательны actual staged content, весь outgoing object range и Gitleaks 8.30.1. Окончательные SHA, результаты scan/clean-clone/CI и URL нового draft PR прикладываются к PR и пользовательскому handoff после проверки. Этот документ фиксирует локальную acceptance candidate; наличие CI-конфигурации не является успехом CI. Main/Pages/visibility/deployment не меняются; окончательный certified Phase 4 release tag не создаётся.

## 9. Изменённые области

Новые native-spatial, native-map/native-camera/CSS; integration в RecordingSource/AppState/contracts/app/real-telemetry/index; синтетические fixtures/unit/browser suite; explicit Worker action allowlist/build manifest; README/AGENTS/PRODUCT/cloud/testing и Phase 4 документы. Protected `engine/`, исходная measured-analysis математика и playback.js не изменялись. Старый static beta root сохраняется при публикации.

## 10. Запуск

GitHub clone:

```sh
git clone --branch real-track-map-phase4 https://github.com/Fwor1d/apex-lab-beta.git
cd apex-lab-beta/source
npm run setup:cloud
npm test
npm run dev
```

Адрес: `http://127.0.0.1:4190/apex-lab/`. В самостоятельном локальном проекте package.json уже в корне — `cd source` не нужен. DEMO не требует личных данных. Node>=22, Node22 devcontainer. Codespaces/Codex Cloud setup и private forwarded port 4190 описаны в [CLOUD-DEVELOPMENT](docs/CLOUD-DEVELOPMENT.md). Реальные пользовательские Codespaces/Cloud environments в задаче не создавались.

## 11. Следующий обязательный этап

Выполнить [локальную authentic acceptance](docs/PHASE-4-LOCAL-ACCEPTANCE.md) для **всех шести** исходных LMU файлов, не копируя их в Git/Cloud. Исторические S2 2/4 и S4 1/2 — только кандидаты для повторной независимой spatial проверки. Сверить сохранённый oracle, cursor/sample/link/frame, missing states и teardown; затем физические целевые устройства. Не предполагать spatial eligibility всех записей.

После успешной документированной приёмки можно отдельно решать вопрос закрепления Phase 4 и следующей фазы. Phase 5 автоматически не начинается; geographic registration и новый Coaching требуют отдельных заданий.
