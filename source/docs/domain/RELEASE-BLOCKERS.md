# Блокеры полноценного выпуска — после public beta

Phase9/0.10.0: аппаратные статусы ниже не изменены. Position Mapping Engine и NumPy validation реализованы, но **0 verified LMU spatial mappings**: CRS, независимыеanchors, source uncertainty/SF отсутствуют. Новые OSM объекты — reference, не игровые границы. Возможность публикации1.0/обновленияbeta не разрешена этой фазой; многочасовые native файлы/полный browser RSS по-прежнему NOT TESTED. [Текущий технический отчёт](PHASE-9-REPORT.md).

Public beta APEX LAB 0.8.0-beta.2; автоматические Chromium/WebKit выполнялись на macOS. Результат **READY FOR DEVICE ACCEPTANCE**, а не аппаратная сертификация. Phase 7 разрешена пользователем; 13 октября разрешена отдельная static public beta. Аппаратная приёмка при этом не завершена.

| Обязательная проверка | Статус текущей фазы | Что закрывает блокер |
| --- | --- | --- |
| Windows 11 Chrome | BLOCKED: нет физического Windows | W00–W13 из DEVICE-ACCEPTANCE, результаты/версии/память |
| Windows 11 Edge | BLOCKED: нет физического Windows | Тот же независимый протокол, keyboard/200%/contrast theme |
| iPhone Safari | BLOCKED: нет физического устройства; HTTPS beta доступна | I01–I07, Files, VoiceOver, portrait/landscape, системный текст |
| Installed PWA install/offline/update | BLOCKED: нет реального iPhone; HTTPS beta доступна | I08–I10; второй versioned candidate на том же origin, явное обновление |
| Пик памяти целевого браузера | BLOCKED: доступные JS/managed proxies не полный RSS | Windows browser Task Manager, repeated import/cancel/export, отсутствие роста после циклов |
| Hosting target/account eligibility | PASS: отдельный публичный static repo/HTTPS Pages | Основной source Git не публикуется; полный тариф не выводится |
| Авторизация beta | PASS: явное разрешение 13 октября | Только static beta; DNS/source visibility не разрешены |

Автоматизация current Phase 7: unit/native/browser/platform/Python/optional desktop, numerical equivalence, privacy/offline/base paths — PASS. Проверка secure-origin через Playwright или macOS WebKit не меняет таблицу выше. PowerShell-launcher подготовлен, но его Windows-исполнение — NOT TESTED; W00 может обнаружить специфическую проблему окружения.

## Границы поддержки, которые нельзя превратить в обещания

- Оригинальные многочасовые записи и новые recorder/storage versions: NOT TESTED. Сохранён ограниченный LMU Version 1 adapter. Native256 MiB/GPS500000/JSON32 MiB и другие guards действуют. Отказ за guard не является дефектом заявленной поддержки.
- Точный peak Wasm+JS+Arrow+renderer неизвестен. DuckDB managed memory и числовой payload floor — отдельные proxies.
- Algarve positional registration, реальные spatial ghost/heatmaps/yaw/elevation withheld. Справочный outline не подтверждённая racing trajectory.
- Quality filter не является спортивной сертификацией; модель автомобиля/причина инцидента остаются неизвестными при недостаточных данных.

Поддержка длинных записей/новых схем требует отдельной валидации; публичный первый выпуск может иметь явную ограниченную поддержку. Аппаратные блокеры и privacy/failure issues нельзя закрывать формулировкой в документации.

## Ограничение cold-runtime beta

Cold-start, prepared/offline runtime и физические устройства требуют отдельной приёмки. Дедлайны не увеличены. Детальные результаты частных импортов не публикуются.

## Phase10 /0.11.0

Локальный путь прошёл Mac Chromium/WebKit и независимый NumPy; это не географическая регистрация и не hardware acceptance. Сохраняются физические Windows11 Chrome/Edge, iPhone Safari/VoiceOver/DynamicType, PWA installation/update, браузерный process/Worker peak-memory и длительные записи. JSON пока без coordinate extension; интерфейс сообщает об отсутствии координат. Public beta0.8.0-beta.2 и DNS не меняются. Новый local mode не закрывает старые release blockers.
