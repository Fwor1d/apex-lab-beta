# Phase 4 · независимые reviews

Выполнены отдельные проходы архитектуры/научной корректности, security/lifecycle, UX/responsive и покрытия тестами. Review по коду не заменяет фактический browser suite и authentic acceptance.

| Review | Findings и результат |
|---|---|
| Architecture/science | P2: camera reset при remount; P2: generic spatial rejection терял исходную причину. Исправлены и повторно проверены reviewer. Raw arrays/relative frame, bounded native lookup, unchanged measuredMapping, отсутствие interpolation/yaw/геопривязки и второго clock подтверждены чтением кода. |
| Security/lifecycle | Тот же P2 remount исправлен. Source/analysis/spatial generations, dedupe, discard stale, fixed RPC, safe numeric SVG, error allowlist, terminate/release и cleanup просмотрены. Финальная dirty-layout схема/position provenance проверены повторно; новых существенных findings нет. |
| UI/UX | Пять synthetic screenshots просмотрены отдельно. A/B labels разделены без смещения координат; кольцо A/точка B читаются при совпадении. P2 partial empty-state предлагал уже включённый недопустимый B — исправлено, доступная роль названа, график B сохранён; browser assertion добавлен. |
| Test coverage | Найдено перекрытие B/C в long fixture, из-за которого benchmark терял B. Исправлено spacing, добавлены assertions ready/pairAvailable/обоих размеров. Добавлены endpoint-span и mapping-gap проверки, счётчик отсутствия повторной сериализации, HUD/Follows center, swap during playback. Reviewer успел передать findings, но завершение его прохода было прервано лимитом сервиса. Закрытие этих замечаний и финальные результаты проверены root; полного финального независимого sign-off coverage не заявляем. |

Root дополнительно обнаружил и исправил initial WebKit marker placement и ResizeObserver feedback loop: наблюдатели только выставляют dirty, DOM обновляет прежний единственный scheduler. Ошибки не фильтруются в suite. Все новые 19 unit tests и 14 browser groups в обоих движках прошли.

Отмена карты логическая, pending RPC ограничен исходным timeout; это явно документировано. Окончательный staged/outgoing аудит проводится отдельно перед публикацией, не подразумевается перечисленными reviews.

Открытых известных P0/P1 implementation findings нет. Authentic spatial acceptance, физические устройства, extended heap/long recording stress, geographic registration и legal ownership obligations остаются явными границами candidate. Ни один reviewer не подтверждал authentic LMU результат этой версии.
