# Происхождение и лицензии APEX LAB

Unified Phase 1 `0.13.0-phase1` сохраняет production-модули из commit `0f39b71cc83b772ead39081c100a606a3ecf25da` и одобренный интерфейс Revision 5.2. Этот checkpoint подготовлен к отдельно разрешённой публикации исходников. Новая лицензия на оригинальный код APEX LAB не назначается; deployment не разрешён.

Исходные SHA-256, origin-relative пути и явно обозначенные privacy-редакции документации/optional tests находятся в `docs/SOURCE-PROVENANCE.json`. Неизменные mathematical/Worker модули и UI assets проверяются отдельно. Полные приватные отчёты и исходные assertions не включены в Git.

React, React DOM, Motion и Anime.js: MIT notices и legal comments — `app/assets/licenses/`. React Bits: **MIT + Commons Clause License Condition v1.0**, не MIT-only; полный текст и provenance закреплённой ревизии сохранены там же и в `engine/apps/platform/ui/react-bits/`. Bundles UI R5.2 сохранены побайтно.

DuckDB-Wasm 1.32.0 и transitive notices — `engine/apps/browser-telemetry/licenses/`; build копирует их рядом с local Worker/Wasm. Зависимости устанавливаются из lockfile. Apache Arrow/FlatBuffers/SWC helpers — Apache-2.0, tslib — 0BSD с copyright notice, js-sha256/json-bignum — MIT.

Геометрия OSM/track-atlas сохраняет исходники GeoJSON, SHA, attribution и ODbL-1.0 notices. Код track-atlas имеет отдельную MIT attribution; она не превращает координатную базу в MIT. Lovely metadata не включена. Карты reference-only; они не доказывают LMU registration или track limits.

Инвентарь, ограничения будущей proprietary лицензии и вопросы прав: `LICENSING-PLAN.md`. Собственная лицензия не отменяет обязательств по сторонним компонентам и данным.
