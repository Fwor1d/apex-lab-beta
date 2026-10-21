> Исторический отчёт Phase 1. Публичная редакция без личных путей и подробностей записей. Актуальная Git/cloud-инструкция: CLOUD-DEVELOPMENT.md.

# APEX LAB — отчёт по Unified Application Foundation

**Дата:** 20 октября 2026 года. **Версия нового проекта:** 0.13.0-phase1. **Объём:** Phase 1, локальная единая основа на утверждённом UX Revision 5.2.

## 1. Что получено

Создан самостоятельный проект `<local-project>`. Он содержит один статический вход, один shell и одну навигацию, канонический AppState, единый playback owner, изолированный synthetic DataSource и проверенные копии production-модулей.

Интерфейс показывает DEMO. Реальные записи из аудита не подключены к этому UI. Это намеренная граница Phase 1, отражённая в диалоге импорта, source descriptor и build manifest. Наличие importer/Worker в проекте не предъявляется как готовая real-интеграция.

Утверждённая композиция R5.2 сохранена: Track Map, Pit Wall, Driving Lab, HUD, воспроизведение, компактные события, камера, выбор A/B и адаптивная перестройка. Новая визуальная система не создавалась. Единственное дополнительное правило CSS исправляет унаследованную высоту четырёх нативных select в WebKit с 20 до 44 px. Расчёты production engine не переписывались.

## 2. Локальное размещение и сохранность

Перед началом записи проверены canonical parent, цепочка каталогов, отсутствие существующего целевого проекта, локальный filesystem и свободное место. Назначение не разрешается в iCloud Drive, OneDrive или CloudStorage. Исходные проекты не используются как выходные каталоги.

Фактический mount: `/System/Volumes/Data`, APFS, local. У `<local-project-parent>` и назначения нет перенаправляющих symlink. При окончательной проверке оставалось более 230 GB свободного места. `diskutil` недоступен в текущем runtime; тип/локальность подтверждены системным `mount` и `df`, это отдельно сохранено в evidence.

В новом корне находятся source, dist, node_modules, npm/Playwright/Impeccable cache, временные профили, снимки, логи и документация. Исходные node_modules, .venv, старый dist и телеметрия не копировались. Установлены locked зависимости. Сохранены необходимые runtime assets утверждённого прототипа; дубли старых generated production UI bundles удалены из новой копии.

До начала работ назначения не существовало. Существующие пользовательские файлы не перезаписывались. Создана локальная ветка `codex/unified-foundation`; remote не добавлялся. Публикация, push, deploy и DNS не выполнялись.

## 3. Проверенные источники

| Источник | Подтверждение |
| --- | --- |
| Production | `<production-origin>` |
| Ветка production | `codex/mobile-foundation` |
| Production HEAD | `0f39b71cc83b772ead39081c100a606a3ecf25da` |
| Production package | 0.12.1; Node ≥22 |
| Production baseline | 604 tracked files; Git status чистый |
| Утверждённый UX | `APEX-Track-Map-Polish-Revision-5_2-2026-10-19/prototype` |
| Prototype baseline | 60 файлов с исходными SHA-256 |
| Phase 0 | Документы из `APEX-LAB-Integration-Audit` |
| Реальные записи | Остались в `APEX-LAB-Data/lmu`, вне нового проекта |

Фактический production baseline совпал с аудитом. После интеграции повторная проверка подтвердила неизменность всех 604+60 исходных файлов, HEAD и Git status. Manifest хранит источник, назначение и SHA-256 копий. Версии, resolved/integrity и состав locked dependencies совпадают с production; изменена только собственная версия нового пакета.

Лицензии и атрибуция React/React DOM/Motion/Anime.js/React Bits, DuckDB-Wasm и transitive dependencies сохранены. Оригинальные React Bits geometry/spring не менялись. GeoJSON и OSM/ODbL provenance сохранены вместе с данными. Подробности — `NOTICE.md`.

## 4. Что перенесено из production

В `engine/` находятся importer, engine/Worker/client, analysis, quality-связанные функции, Coaching Engine, Extended Analytics, portable report/export Worker, source/position/native-trajectory guards, profile contract, образовательное ядро и связанные данные/типы/тесты.

Модули сохраняют исходные относительные зависимости. Проверка `check:security` сравнивает SHA-256 всех engine copies. Для нового UI не менялись SQL, thresholds, сравнение по Lap Dist, правила missing/gaps/plateau, допустимость пары или ownership timeImpact.

Старые production application controllers не запускаются вложенно. В сборке один HTML entry, а не два приложения под общей обложкой. Python runtime не включён; исходный Python oracle не менялся.

Сборка генерирует локальный DuckDB-Wasm 1.32.0 vendor из lockfile. Его наличие позволяет сохранить будущую Worker-границу. DEMO shell его не загружает и не создаёт native Worker. Проверку реального импорта в новом UI можно будет заявить только после соответствующего следующего этапа.

## 5. Что сохранено из Revision 5.2

Перенесены presentation-модули, стили, локальные assets, исходные DEMO-формулы и тесты поведения. Сохранены цвета A/B, правила видимости событий по масштабу, связь marker с source point, камера fit/follow/pan, навигация по участкам, HUD и панели.

Сопоставление baseline/current выполнено при одинаковом synthetic A/B/cursor. Track Map проверен на desktop и mobile; Pit Wall и Driving Lab — отдельными полными снимками. Layout дополнительно проверен в landscape и tablet размерах. Снимки относятся к реально отрисованной странице, а не только к HTML/CSS-файлам.

Замена импортов на facade не создаёт нового synthetic вычислителя. Учебные оценки и DEMO-пороговые события продолжают иметь прежние ограничения. Режим записанной траектории в Driving Lab явно недоступен; учебная дорога не выдается за зарегистрированную real-геометрию.

## 6. Единый AppState

`app/core/app-state.js` владеет выбранными кругами, курсором, воспроизведением, диапазоном анализа, камерой, route, слоями, событиями и учебным состоянием. UI facade совместим с существующими потребителями R5.2, но не создаёт второй store.

Изменение A/B атомарно: недоступная/одинаковая пара отклоняется; допустимая смена увеличивает generation, останавливает playback и очищает прежний event/training context. Навигация по экрану, follow/fit и выбор навигационного участка не изменяют analysis range или текущую пару.

`setSource` освобождает предыдущий source и инвалидирует зависимый контекст. Новая сессия не может незаметно продолжить выбранное событие предыдущей. Команда существует как foundation boundary; активировать real source из UI в этой фазе нельзя.

Снимки состояния копируются для подписчиков. Immutable event arrays остаются immutable. Запись в nested playback не обходит команды; удаление канонических playback-полей запрещено.

## 7. Единственный playback owner

`app/core/playback.js` содержит один scheduler. Машины, HUD, графики и event cursor используют единый источник позиции. Повторный start, смена режима, pagehide/pageshow и visibility не создают независимых петель воспроизведения.

Курсор хранится как одно значение с basis: точная дистанция после ручного seek либо elapsed time круга B при воспроизведении. Time/distance selectors производны. Это уточнение наброска контракта Phase 0 сделано для сохранения точного ручного seek исходного R5.2: обратный synthetic поиск давал малую ошибку на целой дистанции. Точность baseline assertions не снижалась.

Кадр ограничен 0.1 с; rate применяется один раз. На конце круга playback останавливается, но последний кадр доставляется. При временном скрытии страницы RAF снимается; после возврата пропущенное время не догоняется. Camera/seek transitions обслуживаются тем же scheduler. UI на паузе не переписывает HUD каждый кадр.

## 8. DataSource и границы достоверности

DemoSource изолирован в `app/data/`. Он маркируется `mode=demo`, `kind=synthetic`, выдаёт descriptor/capabilities и нормализованные значения. Speed на контракте — m/s, педали — ratios, steering — signed normalized input. UI форматирует km/h и проценты только на границе presentation.

Отсутствующее значение остаётся null и сопровождается причиной/статусом. Круг с отсутствующим steering показывает отсутствие канала. Unknown metadata не превращается в Porsche, McLaren, Sebring или Algarve автоматически.

UnavailableRealSource возвращает null/пустые наборы и явную ошибку `PHASE_2_REQUIRED`. Он не подставляет DemoSource и не притворяется импортированной записью. Контракт positionAt уже принимает lapId, но DEMO по-прежнему использует исходный общий synthetic путь. Это не независимые измеренные A/B trajectories.

Подробные SessionRef/LapRef/PairRef, metadata/channel descriptors и Worker view-model из аудита остаются целевым расширением native-интеграции. В Phase 1 намеренно нет фиктивных imported sessions, eligibility или source_verified. Текущий контракт отражает реально доступный synthetic источник.

## 9. Проверки и доказательства

Итоговые числа фиксируются по логам, а не по ожиданиям:

| Проверка | Результат |
| --- | --- |
| Unit + исходные baseline/domain tests | 242 tests: **239 pass, 0 fail, 3 skip** |
| Chromium 155.0.8059.85 | **12 браузерных сценариев pass** |
| WebKit 27.2 | **12 браузерных сценариев pass** |
| Page errors в этих сценариях | **0** |
| Внешние запросы в DEMO | **0** |
| Wasm/native Worker loads в DEMO | **0** |
| SHA-256 production/prototype | **604 + 60 originals unchanged** |
| Locked dependencies | **unchanged** |
| Engine hashes/CSP/source boundary | **pass** |
| Clean build + check:build для `/` и `/apex-lab/` | **pass для обоих base** |
| Select targets после CSS cascade, Chromium/WebKit | **44 px на проверенных четырёх размерах** |

Три skip относятся к приватным oracle checks исходного engine без предоставленного test input. Это не скрытый fail и не доказательство real-интеграции новой оболочки. Authentic six-recording import в этой фазе не повторялся.

Сценарии проверяют единственный shell, честное сообщение импорта, исходный full-fit карты, разделение analysis range/navigation, точный seek, playback при mode/camera changes, отсутствие DOM churn на паузе, A/B/missing steering, три вкладки Driving Lab, compact events 26px с hit target≥44px на допустимом масштабе, сохранение state между routes, lifecycle и root/subfolder URLs.

Производственные математические тесты сохранены без ослабления. Baseline тестам R5.2 изменены только пути импортов и имена facade. Новые тесты ловят непосредственно ошибки введённой foundation.

## 10. Найденные и исправленные ошибки интеграции

- Ошибка имени playback-controller и несовместимый формат проверки top-level await: build теперь проверяет ES module graph до генерации dist.
- Малая ошибка round-trip manual seek: исправлена моделью одного tagged cursor, без изменения synthetic math.
- Proxy над frozen event arrays нарушал JavaScript invariant: immutable данные больше не оборачиваются как изменяемые.
- Возможность обходной nested записи playback: закрыта read-only presentation snapshot.
- Независимый reviewer обнаружил full HUD update на каждом кадре paused state. Исправлено условием successful advance/seek; unit и MutationObserver проверяют паузу и EOF.

- Дополнительная проверка WebKit измерила 20 px у motion/sector-select/alignment/rate и в baseline, и в новой сборке. Пользовательское требование — 44 px. Новый `foundation.css` задаёт этим четырём select явную height/min-height 44 px, сохраняя appearance:auto, цвета, ширины, CSP и все десять исходных CSS. Проверены фактические bounds, выбор rate/alignment и отсутствие overflow в portrait/landscape.

Reviewer подтвердил **ship** в двух ограниченных verdict passes: P2 о лишнем HUD update и P2 об области касания select оценены как resolved. Это не полная сертификация UI, real telemetry или разрешение на публикацию.

## 11. Сборка и runtime

Приложение запускается статически из dist. Node ≥22 нужен для сборки/локального dev server, Python конечному runtime не требуется. `build-manifest.json` содержит hashes assets, один entry и явные `nativeImportConnected=false`, `offlinePrepared=false`.

Финальный dist содержит 147 assets, около 79.5 MB без сжатия, включая подготовленные локальные eh/mvp Wasm-файлы. Это размер дистрибутива, не начальной загрузки DEMO; Wasm в DEMO не запрашивался.

Локальный сервер по умолчанию: `http://127.0.0.1:4190/apex-lab/`. Он слушает loopback и поддерживает только GET/HEAD. Из него не доступны source docs, dependency tree или реальные записи. Harness отдельно использует read-only baseline mount; обычный dev server этот mount не включает.

CSP, локальные bundles и относительные пути сохранены. Подготовка native offline bundle, service worker нового shell и PWA upgrade не включены в объём foundation.

## 12. Оставшиеся ограничения

Пригодные пары реальных записей известны по частному аудиту Phase 0. Их существование доказывает feasibility, но не подключение к новому UI. Реальные metadata, native-import/cancel/release, measured plots/Coach/export и positional paths остаются следующими фазами.

Spatial guards не снимаются. В будущем нужны исходные candidate-plane points, validation, clock/rowid/unit checks, gap/jump gates и независимые anchors для geographic registration. Hash JSON не доказывает подлинность DuckDB; synthetic события не являются фактами эффективности или физическими причинами.

Физический iPhone, VoiceOver, Windows/Edge, файловый picker, PWA secure-origin/install/update, длительные реальные сессии и memory-after-release не проверены. WebKit на Mac не закрывает эти условия. Анимации сохранены по исходникам/asset hashes; matched screenshots сделаны с motion off и не сертифицируют все motion transitions.

Impeccable detector запускался один раз, hooks выключены. Сохранены шесть static contrast warnings и один advisory; они не подавлялись ради чистого результата. Actual CSS/screenshot evidence расходится с предположениями чёрного текста/белого body. Полная WCAG-проверка не заявляется.

## 13. Документы и воспроизводимость

- `README.md` — запуск и структура.
- `PRODUCT.md` — актуальная правда о Phase 1; исторические контексты сохранены отдельно.
- `DESIGN.md` — сохранённая система R5.2, без нового дизайна.
- `AGENTS.md` — правила работы в новом корне.
- `NOTICE.md` — лицензии и происхождение.
- `docs/ARCHITECTURE.md` — store, source, playback и границы engine.
- `docs/TESTING.md` — команды, результаты и непроверенные условия.
- `docs/SOURCE-PROVENANCE.json` — исходные hashes и lineage копий.
- `docs/DESIGN-PRESERVATION.md` — документирующая проверка сохранения UI.
- `docs/domain/` — сохранённые ограничения LMU, Coach, spatial и учебной модели.
- `evidence/` и `.impeccable/review/` — локальные логи/снимки, без Git.

## 14. Граница задания

Полученная текстовая спецификация обрывается после начала раздела 4 — «The final application must look». Утверждённый UX и объём восстановлены только из явно предоставленных разделов 0–3, Mission и Phase 0 roadmap; отсутствующие пункты не выдумывались. Продолжение не использовано как повод менять визуальный мир или начинать новые фазы.

Следующий технический этап после отдельного задания — подключить безопасный native File→Worker→Session/Laps к этой оболочке и проверить его на прежних независимых oracle. Он в текущей работе не начат. Публикация, deployment и внешний сервис не выполнялись.
