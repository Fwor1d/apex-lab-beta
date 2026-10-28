# Граница Phase 4 — измеренная карта

Phase 3 предоставляет импортированный источник, стабильные ID, текущую пару, исходные profiles/comparison, качества и единый B-time/distance cursor. Пространственные массивы в REAL UI не подключены, source.positionAt остаётся null, capabilities.positions/geographic/yaw=false.

Существующий Worker сохраняет positions после open. Отдельное действие `native-trajectory` вызывает исходный `buildNativePair(positions,session,a,b)`; его нельзя заменить DEMO path. `position-source.js` читает positional channels с прежними clock/rowid/unit guards. `native-trajectory.js` проверяет локальную кандидатную плоскость и пару. Это отдельный допуск, не географическая регистрация. Необходимы проверки source/pair generation, same-recording/frame/quality, native shape и разрывов. Release должен очищать любые новые retained arrays вместе с текущим source.

Для native cursor использовать исходную временную точку A→LapDist и distance-matched B по документированному контракту, согласованному с единственным canonical cursor. Не выводить физический yaw из руля, не сглаживать или замыкать траекторию, не применять ICP/OSM/per-lap fit. Spatial highlighting не создаёт новых timeImpact.

`validate-position` / `position-mapping.js` — другая граница: rigid rotation/translation scale=1 с независимыми anchors/layout/uncertainty/residuals. Успешная local native path не доказывает CRS, official SF, дорожную ширину или границы трассы. Справочные OSM geometry и местные координаты записи должны сохранять разные provenance и capabilities.

В следующем отдельном задании нужны private oracle geometry tests, gap/jump/clock validation, shared-cursor integration, A/B screenshots без private identifiers, responsive camera/hit-target checks, Worker memory/network tests и отдельный security review. JSON apex-report/1.0 остаётся distance-only; экспортированных флагов spatial доверия недостаточно.

Phase 4 здесь не реализована. Не начинать её автоматически и не включать geographic overlays, реальные braking markers, yaw или fake road corridor.
