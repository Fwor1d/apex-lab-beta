# Phase 4 · результаты проверок candidate

Проверка: 15 ноября 2026 UTC. Фактическая среда — локальный macOS/Darwin 24.6.0 arm64, Node 24.21.0 (совместим с требованием >=22), закреплённый Playwright 1.64.0. Это не запуск Codex Cloud и не физический мобильный benchmark. GitHub CI использует Node 22; его фактический результат указывается в новом PR после завершения run.

| Проверка | Chromium | WebKit / общий итог |
|---|---:|---:|
| `npm test` | — | **288 pass, 0 fail, 3 private skips**; 291 total |
| Новые native unit/contract/lifecycle tests | — | **19 pass** (входят в 288) |
| `test:e2e` DEMO R5.2 | **12/12** | **12/12** |
| `test:import:e2e` настоящий Worker + synthetic DuckDB | **13/13** | **13/13** |
| `test:analysis:e2e` public synthetic A/B | **9/9** | **9/9** |
| `test:trajectory:e2e` Phase 4 | **14/14** | **14/14** |
| `build -- --base=/` + `check:build` | — | passed |
| `build -- --base=/apex-lab/` + `check:build` | — | passed |
| `check:security` / `check:provenance` | — | passed; engine/locked dependencies unchanged |
| Read-only original hashes | — | 604 production + 60 R5.2 unchanged |
| Authentic Phase 4 LMU / Python oracle | **не запускалась** | **pending local acceptance** |
| Physical iPhone/Android/Windows, VoiceOver | **не запускались** | отдельная аппаратная приёмка |

Counts — test groups, где suite так их определяет. Прежние 336085 численных authentic сверок Phase 3 не включены в результаты Phase 4. Три private assertion bodies не заменялись заглушками и не запускались с synthetic вместо oracle.

## Проверяемые свойства

- Контракт raw points/links, kind/unit/frame, конечность и bounds, same source/session, отклонение mismatch и некорректных лимитов.
- Разрывы, скачки, нет координат у A/B, одиночный путь, запрет несовместимого overlay, неизменность относительного A/B смещения.
- B-time → shared distance → timeAt(A/B) → bounded original sample; no coordinate interpolation и no endpoint fabrication внутри telemetry domain, но вне native span.
- Missing/ambiguous distance mapping, range highlight только по валидным native samples; графики сохраняются при spatial отказе.
- Dedupe активной пары; late pair/source completion; cancel/retry; clear/release/DEMO; очищенные удерживаемые ссылки. Это не формальный heap/leak сертификат.
- Пять viewport: 1440×900, 1280×720, 768×1024, 390×844, 844×390; overflow отсутствует, native map controls ≥44px, функциональные подписи ≥11px после cascade, uniform fit containment.
- Fit, Follow A/B с точным совпадением центра и sampled position, freeze на missing, manual mouse/wheel/keyboard, mini-map same paths/viewport, сохранение cursor/range.
- Chromium CDP two-finger pinch/translation + taps; WebKit taps/pointer/keyboard. Физический touch/VoiceOver не проверен.
- Active playback swap; сохранение камеры при channel remount и возврате на карту; полный диапазон; согласованность graph cursors и HUD.
- Нет pageerror, external requests, POST/query payload, IndexedDB, CacheStorage или service-worker registrations. Никакого подавления ResizeObserver ошибок: DOM updates перенесены в существующий scheduler.

## Визуальная проверка

Синтетические снимки основного стенда: full map desktop/tablet/portrait/landscape, Follow, manual zoom, gap, invalid и partial. Они находятся в ignored evidence, не в Git. Просмотрены root и отдельным UX reviewer. DEMO suite использовала доступный оригинальный read-only R5.2 для side-by-side captures; сохранённые 10 CSS также побайтно проверены. Pixel-diff certification не заявляется. Детектор Impeccable выполнен один раз; он не заменяет осмотр и не доказывает корректность телеметрии. Hooks остаются disabled.

## Репрезентативная synthetic нагрузка

Детерминированный тест: A 5001, B 5251 native points (10252 суммарно); профиль A 50001 отсчёт, B 52501. Один native request на активную пару; при 20000 position lookups и playback geometry serialization не повторяется.

| Наблюдение, мс | Chromium | WebKit |
|---|---:|---:|
| Исходный buildNativePair в test transport | 30.6 | 34.0 |
| Проверка/подготовка spatial adapter | 0.8 | 1.0 |
| Весь synthetic transport request + adaptation | 32.3 | 35.0 |
| 20000 вызовов positionAt | 15.0 | 12.0 |
| Fixture setup → готовые пути UI, включая automation overhead | 272.2 | 258.1 |

Это единичные наблюдения последнего полного прогона на указанном Mac, не SLA/FPS/heap certification. Synthetic transport выполняет engine function внутри тестового browser контекста: числа не являются измерением реального Worker IPC или чтения authentic файла. Производственный путь остаётся Worker-owned, что подтверждено кодом/хешами и отдельными native-import regressions. Размеры/счётчики каждого прохода сохранены в ignored JSON. Swap/source/cancel и повторный release проверены функционально; отдельная количественная сертификация памяти и pair-switch latency не заявляется.
