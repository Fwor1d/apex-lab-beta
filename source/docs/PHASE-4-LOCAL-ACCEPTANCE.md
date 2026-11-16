# Phase 4 · authentic LMU acceptance на разрешённом компьютере

Статус этой версии: **candidate, проверка authentic spatial data pending**. Выполнять отдельно на компьютере владельца данных. Не переносить личные файлы, oracle, координаты или результаты в Cloud/Git/CI. Шесть записей остаются read-only в исходном каталоге; не копировать их в проект. Ниже — процедура, а не заявление о пройденной проверке.

## Подготовка

1. Получить `real-track-map-phase4`, проверить SHA из PHASE-4-REPORT/PR. Из GitHub clone перейти в `source/`; для независимого локального checkout использовать его корень.
2. `npm run setup:cloud`, `npm test`, `npm run check:security`, `npm run check:provenance`, `npm run check:publication`.
3. `npm run dev`, открыть `http://127.0.0.1:4190/apex-lab/`. Приватный результат проверки хранить только локально в ignored `evidence/phase4-local/`; создать каталог внутри проекта. Снимки перед сохранением должны исключать имена водителя/SteamID/абсолютные пути. Не публиковать массивы координат или oracle.
4. При использовании прежнего Python oracle следовать существующему локальному протоколу Phase 3 в TESTING.md. Он остаётся независимым: не менять Python/JS алгоритмы или tolerance ради совпадения. Не задавать private environment variables в Cloud/CI.

## Каждая из шести записей S1–S6

Для каждого идентификатора заполнить отдельную приватную строку: import result; lap inventory; eligible telemetry pair; native A/B availability и причины; missing positions; mapping/cursor consistency; network requests; release. Публично сообщать только агрегированный статус без telemetry metadata.

1. Выбрать исходный .duckdb через File picker; дождаться завершения Worker. Проверить все круги и причины eligibility, unknown/pit/partial остаются отдельными. Успешный импорт не равен наличию двух допустимых кругов.
2. Сверить Phase 3 графики/численные массивы с оригинальным oracle по прежнему full-array протоколу. Не заменять native путь JSON импортом. Отсутствующий private oracle — **not run**, не passed.
3. Если нет eligible A/B — сохранить этот исход; не изменять политику, не делать synthetic fallback. Если есть пара, открыть «Карта» и записать независимый spatial result. Наличие пары не гарантирует native пути.
4. Проверить x/y и links напрямую по существующему `buildNativePair` в локальном разрешённом диагностическом контексте: одна запись, один frame/origin, исходные единицы, без per-lap преобразований. Частные координатные массивы не экспортировать в публичный отчёт. Самостоятельный географический fit/OSM overlay запрещён.
5. Сверить минимум начало/середину/конец native coverage, интервалы пропусков и несколько точек после seek: общий B-time → LapDist → timeAt(A/B) → исходный bounded native sample. При отсутствии точки маркер должен исчезать; нельзя принимать удержанный endpoint как измеренную позицию.
6. Проверить play/pause/rate, graph seek, точную дистанцию и время, range/full reset, swap во время playback. HUD/графики используют общий курсор; камера/мини-карта не меняют range или playback.
7. Fit/Follow A/B/manual pan/zoom, tablet/phone layout. При missing Follow должен сохранять последний центр с сообщением; ориентация машины не заявляется.
8. Во время pending сменить пару, закрыть запись, выбрать другую, затем DEMO и обратно. Старый путь должен исчезнуть, late response не должен вернуться. Повторить импорт/закрытие несколько раз, наблюдать Worker termination и отсутствие накопления retained sources через DevTools.
9. DevTools Network: только same-origin static assets/Worker/Wasm. Нет POST/upload/external fonts/analytics, отсутствие записей в IndexedDB/CacheStorage. Отключить сеть после загрузки assets и повторить интерфейсные действия; offline install/PWA этой версии не заявляется.

## Известные пары — кандидаты на повторную проверку

Phase 0/3 исторически нашли S2: круги 2/4; S4: круги 1/2. Это **не результат Phase 4**. Проверить сначала текущую telemetry eligibility, затем отдельно native geometry/clock/frame/pair shape. Не объявлять все остальные записи пространственно недопустимыми без проверки. Если текущие данные не совпадают с историей — зафиксировать расхождение, не менять входные файлы.

## Критерий принятия

Заполнены все шесть строк и все доступные eligible пары; oracle regression не изменена; независимые spatial reasons корректно отображены; нет fabricated positions/gap joins; raw A/B relative geometry сохранена; никаких private uploads. Проверены актуальные Chrome/Safari и реальные целевые устройства. Отдельно зафиксировать фактически непроверенные устройства и условия.

До этого этапа не создавать окончательный certified Phase 4 tag, не merge/deploy и не начинать Phase 5 автоматически. При расхождении engine-level изменение требует отдельного разрешения и новых регрессионных доказательств.
