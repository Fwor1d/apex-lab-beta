# План лицензирования — решение о proprietary лицензии не принято

Дата проверки: 20 октября 2026. Это инвентарь материалов и вопросы для последующей юридической проверки. Окончательная лицензия APEX LAB не выпускается.

| Материал | Найденные условия | Что сохраняется |
| --- | --- | --- |
| Оригинальный APEX LAB / production / R5.2 | Отдельный root LICENSE не найден | Авторство и история источников; отсутствие LICENSE не означает разрешение MIT |
| Существующий public beta main | Root LICENSE отсутствует; есть сторонние notices в static assets | Ветка сохраняет все прежние файлы и историю |
| React/React DOM 19.3.1, Motion 14.2.0, Anime.js 4.5.0 | MIT | Полные copyright/permission notices и legal comments в assets/licenses |
| React Bits, revision 43591e8b3fa327d45633b4e8239ff6742ef706ef | MIT + Commons Clause License Condition v1.0 | Не MIT-only. Текст разрешает использование в составе приложения; ограничивает продажу/сублицензирование/распространение самих компонентов. Сохранены точный текст, SHA и адаптации |
| DuckDB-Wasm 1.32.0 / DuckDB core | MIT | Vendor attribution; upstream LICENSE DuckDB v1.4.3 побайтно совпал с сохранённым MIT-текстом DuckDB-Wasm |
| Apache Arrow 17.0.0, FlatBuffers, SWC helpers | Apache-2.0 | LICENSE/NOTICE, авторские уведомления |
| tslib | 0BSD | LICENSE и CopyrightNotice |
| js-sha256, json-bignum | MIT | Полные notices; json-bignum license прочитана из файла, поле npm metadata отсутствует |
| OSM / производная координатная база | ODbL-1.0 | © OpenStreetMap contributors, ссылки, provenance и доступные GeoJSON; не покрывать чужую базу исключительной лицензией APEX |
| Код tobi/track-atlas | MIT, отдельно от данных | track-atlas-MIT.txt и UPSTREAM-ATTRIBUTION.txt |
| Географические дополнительные источники | OSM; для отдельных источников USDA/USGS public-domain attribution по manifest | Per-feature источники, omissions; Lovely corner/sector/pit metadata не перенесена |
| Шрифты и медиа | Системный font stack; внешних font downloads нет | Локальные SVG/icons/CSS R5.2, происхождение в manifest; права на оригинальные медиа требуют подтверждения владельцем |
| Dev dependencies (Playwright, esbuild, Prettier и transitive) | MIT/Apache-2.0/0BSD по lock и license files | Точные версии и inventory в docs/DEPENDENCY-LICENSES.json; node_modules не публикуется |

Цель будущей proprietary лицензии: определить разрешённые способы использования оригинального приложения, коммерческую модель, распространение модификаций, товарные знаки, ответственность и поддержку. Исключить из её исключительных условий сторонний код/данные и явно приложить их обязательные notices.

До выпуска юридически проверить: кто является правообладателем оригинального кода и медиа; права/согласия участников; применимость Commons Clause к выбранной модели распространения; ODbL obligations для производной базы и будущих её изменений; Apache NOTICE obligations и пакетный состав Wasm; использование названий/логотипов LMU, автомобилей и трасс. Наличие source hashes подтверждает происхождение копий, но не передачу исключительных прав.

Публичный репозиторий технически доступен для чтения, скачивания и fork. Будущая custom лицензия сама по себе не может технически запретить эти действия или отменить уже выданные права третьих сторон. Правила повторного использования оригинального кода требуют отдельного решения владельца; новую MIT/Apache/GPL для него не добавлять.

Источник условий — сохранённые LICENSE/NOTICE, lockfile и upstream provenance; текущий checkpoint не удаляет и не заменяет правовые уведомления. Private telemetry не является лицензируемым приложением пакетом и в публикацию не включена.
