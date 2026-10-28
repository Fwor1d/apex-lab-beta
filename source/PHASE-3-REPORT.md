# APEX LAB — Integration Phase 3

Приёмка: **28 октября 2026 года**. Версия **0.15.0-phase3**. Реальный A/B анализ подключён к единому приложению с интерфейсом Revision 5.2. Новый дизайн и новый вычислительный движок не создавались. Phases 4–6 не начаты.

## Реализованный путь

Локальная LMU DuckDB → прежний FileHandle/read-only AnalyzerWorker.open → сохранённые validated profiles → profile(A), profile(B), compare(A,B) → строгий RecordingSource adapter → один AppState → Overview, Pit Wall, HUD и существующий playback controller.

После импорта DuckDB закрыта. Для графиков или кадров playback база не переоткрывается. Переиспользованы client.js, worker.js, importer.js, analysis.js, portable profile contract и неизменные quality/Coach/extended dependencies. Их исходные SHA-256 проверены. Защищённые математические алгоритмы, пороги, SQL, Python oracle и форматы экспорта не изменены.

В REAL Overview доступны выбранные круги, записанные Lap Time, разница полных времён, текущие значения, common-distance delta и поля качества. Pit Wall показывает speed, brake, throttle, steering и delta. Есть выбор канала, переключение A/B серий, курсор, интервал, zoom/pan/reset и смена A/B. HUD читает тот же курсор. Недоступные значения подписаны «Нет данных»; они не превращаются в нули или DEMO.

## Данные, идентичность и время

Recording/session/lap identity, source kind/hash и выбранная пара проверяются перед публикацией результата. Очередь source и поколение AppState отсеивают поздние profile/compare ответы. Смена пары останавливает playback и очищает старые показания. Cancel comparison оставляет импортированную сессию; release/source replacement завершает прежний Worker и освобождает ссылки. Main thread удерживает только два активных профиля и одно comparison; state snapshots не копируют массивы.

Исходная общая сетка, normalized delta, missing masks, policy и origin принадлежат production compare. B−A > 0 означает, что B медленнее. UI отдельно показывает:

1. Разницу записанных полных Lap Time.
2. Дельту последней общей валидной дистанции с её координатой.
3. Дельту у текущего курсора.
4. Изменение дельты между границами непрерывно валидного интервала.

Эти показатели не объявляются одинаковыми и не складываются. Скорость хранится в м/с и переводится в км/ч один раз; педали и steering — нормированные значения. Steering не выдаётся за угол колёс или yaw.

Canonical cursor — distance либо measured elapsed time B. Ручной distance seek сохраняет точное выбранное значение; playback использует реальные timestamps B и кусочно-линейную mapping по исходным samples. За границами нет extrapolation/endpoint clamping/nearest fallback. Дубликаты, неоднозначность и пропуски разрывают mapping; регрессия её отклоняет. Playback останавливается на конце текущего валидного участка, включая большой шаг кадра. Один прежний core/playback.js владеет RAF, view transitions не создают новые часы.

Плато оставляет engine delta недоступной; остальные каналы продолжают работать там, где валидны. Даже coverage=100% конечных grid nodes не скрывает gaps между ними: continuityBreaks переводит analysis в partial, график разрывается, interval delta через gap отсутствует. При отклонённой перемотке курсор сохраняется и панель с объяснением раскрывается.

## Проверенные записи и oracle

Все шесть original LMU записей открыты локально через настоящий browser File/Worker pipeline. Они не копировались в проект или cloud.

| Запись | Сегменты | Результат |
| --- | ---: | --- |
| S1 | 1 | Импортированная сессия, допустимой пары нет |
| S2 | 6 | A=2, B=4, настоящий comparison и playback |
| S3 | 1 | Импортированная сессия, common-distance analysis недоступен |
| S4 | 5 | A=1, B=2, настоящий comparison и playback |
| S5 | 2 | Импортированная сессия, допустимой пары нет |
| S6 | 8 | Один eligible lap, допустимой пары нет |

Все 23 validation совпали с существующим Python oracle. Для S2/S4 сверены полные профили и comparison: grid, aligned time/speed/brake/throttle/steering/delta, masks, coverage, plateau, origin и policy. **169153 и 166932 числовых сверки, максимальное отклонение 0, прежний допуск 1e-10; 64 и 41 missing masks совпали.** Это выполнено в Chromium и WebKit. Recorded full-lap difference и common-end delta проверены отдельно. Частные записанные числа и полные массивы не включены в public source/report.

Oracle исторически назначал более быстрый круг A; для требуемого обратного порядка только переставлены роли reference A/B и инвертирован знак reference delta. Значения сетки, masks и допуск не изменены. Ни runtime, ни public fixtures не содержат hardcoded результатов реальных кругов.

## Проверки и UX

| Проверка | Локальный результат |
| --- | --- |
| Portable unit/domain | 269 pass / 0 fail / 3 private skips, 272 total |
| Private oracle assertions | 272 pass / 0 fail / 0 skip |
| Phase 3 A/B Chromium | 15 групп: 9 synthetic + 6 authentic |
| Phase 3 A/B WebKit | 15 групп: 9 synthetic + 6 authentic |
| Native import regression | 13/13 synthetic в каждом браузере |
| DEMO R5.2 regression | 12/12 в каждом браузере, approved reference comparison |
| Builds | / и /apex-lab/ плюс check:build |
| Security/provenance | Engine hashes, runtime boundaries, CSP, locked graph сохранены |

Проверены пять размеров: 1440×900, 1280×720, 768×1024, 390×844, 844×390. Screenshots Overview/Pit Wall просмотрены. Overflow отсутствует, функциональный текст ≥11 CSS px, видимые native controls ≥44 px. DEMO сохраняет компактные события, Auto-fit, Follow, A/B silhouettes, Driving Lab tabs, responsive playback и исходные 10 CSS. Полная WCAG/physical-device сертификация не заявляется.

Покрыты нелинейный mapping и точный seek, направление delta после swap, пропуски/plateau/invalid inverse, missing channels, error/cancel/retry, pending pair/source replacement, repeated mounts, shared playback, paused HUD, release и возврат DEMO. На паузе HUD не мутирует. В финальных Phase 3 journeys — 0 неожиданных pageerrors и 0 запрещённых сетевых запросов, включая Worker; raw private storage/SW отсутствуют. Native import fault injection отдельно учитывает ожидаемую ошибку заблокированного Wasm.

Public CI использует synthetic данные. Native synthetic DuckDB остаётся несертифицированной и не проходит production A/B guard. Test-only synthetic transport для analytics вызывает исходный compare и проверяет adapter/UI отдельно, явно помечая TEST. Он не включён в dist и не выдаётся за доказательство native authentic пути. Приватная приёмка дополняет, а не заменяет этот уровень.

## Производительность

Один зафиксированный локальный запуск с Playwright и параллельной DEMO suite: импорт + готовность анализа 0.62–1.57 с в Chromium и 1.08–1.83 с в WebKit. Largest S6 — 1.57/1.83 с, без сравнения. S2/S4 profile/compare request: 166/154 мс Chromium, 151/120 мс WebKit; собственный Worker compare — 21.3/23.4 и 16/18 мс.

Aligned grid payload — 222336 байт, активные профили — 23570/23196 samples. Один SVG path на серию, min/max display envelope сохраняет экстремумы/порядок/разрывы, исходные arrays не меняются. Pit Wall main — 259 DOM элементов. Сто принудительных updateRealCursor — 31.5/35.6 мс Chromium и 40/53 мс WebKit; обычный paused loop этих вызовов не делает. Prefix counts не допускают полного обхода сетки при проверке каждого interval readout.

Chromium usedJSHeapSize всей вкладки — приблизительно 55.6/87.8 MB после journeys; WebKit не предоставляет этот счётчик. Это не доказательство отсутствия долговременной утечки и не measurement только active source. Измерения сохранены отдельно от последнего прогона feedback fix; новых произвольных performance targets не вводилось.

## Независимый обзор

Отдельный reviewer проверил численные/async/source/playback границы и desktop/mobile/landscape UX. Подтвердил устранение P2: REAL time facade больше не зажимает недоступное время в концы круга; отдельный probe и regression возвращают null вне профиля. Новых подтверждённых P0/P1/P2 не обнаружил. P3 со скрытым объяснением отклонённого seek исправлен раскрытием панели и браузерной regression. Полный журнал и пределы обзора: docs/PHASE-3-REVIEW.md. Reviewer не выдавал прочитанный oracle report за свой повторный запуск.

## Сохранность и публикация

Исходные production 604 файла, R5.2 60 файлов, все 9 элементов private dataset, protected copies и lockfile graph сохранены. Проверены hashes, у dataset также размер и mtime. Локальный active checkout расположен в разрешённом каталоге APEX-LAB на локальном диске, без symlink/cloud redirect. Все evidence/cache/tmp/builds остаются внутри него; они исключены из Git. Точный локальный путь приводится в приватном handoff чата, не в public source.

Local root checkpoint и remote source/ имеют разные истории. Публикация использует audited alternate index: новое дерево от published Phase 2 b5682446217f7c41187cf1663ea4360f070b2f1f, app root отображается в source/, CI/devcontainer — в root. Никаких unrelated merge/force push. Все 168 legacy static files сохраняются побайтно. PR #1/#2, их ветки, main и прежний Pages main:/ не изменяются.

Публикуемая ветка: codex/real-ab-telemetry-phase3. Новый draft PR направлен в codex/real-lmu-import-phase2. Перед push actual index и все newly reachable objects должны пройти check:publication и Gitleaks, затем clean-clone setup/tests. Личные базы, oracle, private screenshots, токены, local absolute paths и generated dist не публикуются. Runtime остаётся local-only.

Этот документ подготовлен до формирования собственного commit SHA и запуска remote CI. Точные local/remote SHA, тег v0.15.0-phase3, draft PR URL, clean-clone и фактический GitHub Actions результат фиксируются в handoff чата и в описании нового PR. Конфигурация CI или локальный успех сами по себе не означают успешный remote run.

## Лицензии и облачная разработка

NOTICE, license inventory, React Bits MIT + Commons Clause, Anime.js/React/Motion/DuckDB MIT, Apache/0BSD notices, OSM/ODbL provenance сохранены. Dependency versions не обновлялись. Новая permissive или proprietary лицензия APEX LAB не назначена. Нерешённые ownership/Commons Clause/ODbL/brand вопросы остаются в LICENSING-PLAN.md.

GitHub clone: выбрать Phase 3 branch, перейти в source/, выполнить npm run setup:cloud, npm test, npm run dev. Node>=22, lockfile install, Python/API keys/private recordings не нужны. Codespaces использует root devcontainer Node22; port 4190 оставлять Private. Codex Cloud setup также начинается с source/. Фактическое создание пользовательского Codespace/Cloud environment не заявляется. Полные команды: docs/CLOUD-DEVELOPMENT.md.

Локально из active checkout:

```sh
npm run build -- --base=/apex-lab/
npm run check:build
npm run dev
```

URL: http://127.0.0.1:4190/apex-lab/. Sessions: /apex-lab/#sessions. После выбора .duckdb открыть Telemetry → Обзор или Pit Wall. Dev server обслуживает только dist, без backend. После изменения source выполнить build заново.

## Неподключённые возможности

REAL Track Map/траектории, geographic registration, yaw, дорожные границы, официальные сектора, spatial braking markers, новые coaching calculations, report export UI и полноценный real Driving Lab не реализованы. DEMO явно synthetic. Offline/PWA release, Windows packaging, физический iPhone/Windows/Edge, длительные memory/device tests остаются вне этой фазы.

Phase 4 требует отдельного подключения существующих native-trajectory/position-source с их независимыми guards, pair/frame identity, разрывами и единым cursor; local native plane не доказывает geographic CRS. Подробный план границ — docs/PHASE-4-READINESS.md. Phase 4 автоматически не начинается.

## Перечень исходных изменений

Относительно локального Phase 2 checkpoint; generated/evidence файлы исключены:

- `.devcontainer/devcontainer.json`
- `.github/workflows/foundation.yml`
- `AGENTS.md`
- `PHASE-3-REPORT.md`
- `PRODUCT.md`
- `README.md`
- `app/app.js`
- `app/core/app-state.js`
- `app/core/context.js`
- `app/core/contracts.d.ts`
- `app/data/measured-analysis.js`
- `app/data/recording-source.js`
- `app/index.html`
- `app/real-telemetry.css`
- `app/real-telemetry.js`
- `app/sessions.js`
- `docs/ARCHITECTURE.md`
- `docs/CLOUD-DEVELOPMENT.md`
- `docs/PHASE-3-ARCHITECTURE.md`
- `docs/PHASE-3-REVIEW.md`
- `docs/PHASE-4-READINESS.md`
- `docs/TESTING.md`
- `package-lock.json`
- `package.json`
- `scripts/analysis-acceptance.mjs`
- `scripts/analysis-private-acceptance.mjs`
- `scripts/build.mjs`
- `scripts/check-build.mjs`
- `scripts/check-security.mjs`
- `scripts/import-acceptance.mjs`
- `tests/fixtures/analysis-source.mjs`
- `tests/unit/import.test.mjs`
- `tests/unit/real-analysis.test.mjs`
