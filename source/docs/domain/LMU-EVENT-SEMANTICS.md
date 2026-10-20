# Семантика LMU Version 1 — публичная выдержка

Структура и ограничения исходного аудита сохранены; счётчики событий, диапазоны, настройки автомобиля и результаты частных записей исключены. Персональные исходные отчёты остаются вне Git.

| Событие | Тип | Unit |
| --- | --- | --- |
| `ABS` | BOOLEAN | — |
| `ABSLevel` | UTINYINT | — |
| `AntiStall Activated` | BOOLEAN | — |
| `Best LapTime` | FLOAT | s |
| `Best Sector1` | FLOAT | s |
| `Best Sector2` | FLOAT | s |
| `Brake Bias Rear` | FLOAT | — |
| `Brake Migration` | FLOAT | — |
| `CloudDarkness` | BOOLEAN | % |
| `Current LapTime` | FLOAT | s |
| `Current Sector` | UTINYINT | — |
| `Current Sector1` | FLOAT | s |
| `Current Sector2` | FLOAT | s |
| `Engine Max RPM` | FLOAT | RPM |
| `Finish Status` | UTINYINT | — |
| `FrontFlapActivated` | BOOLEAN | — |
| `FuelMixtureMap` | UINTEGER | — |
| `Gear` | TINYINT | — |
| `Headlights State` | BOOLEAN | On/Off |
| `In Pits` | UTINYINT | — |
| `Lap` | USMALLINT | — |
| `Lap Time` | FLOAT | s |
| `Last Sector1` | FLOAT | s |
| `Last Sector2` | FLOAT | s |
| `LastImpactMagnitude` | BOOLEAN | — |
| `LaunchControlActive` | BOOLEAN | — |
| `Minimum Path Wetness` | FLOAT | % |
| `OffpathWetness` | BOOLEAN | % |
| `RearFlapActivated` | BOOLEAN | — |
| `RearFlapLegalStatus` | BOOLEAN | — |
| `Sector1 Flag` | UTINYINT | — |
| `Sector2 Flag` | UTINYINT | — |
| `Sector3 Flag` | UTINYINT | — |
| `Speed Limiter` | BOOLEAN | — |
| `TCCut` | UTINYINT | — |
| `TCLevel` | UTINYINT | — |
| `TCSlipAngle` | UTINYINT | — |
| `TyresCompound` | UINTEGER/UINTEGER/UINTEGER/UINTEGER | — |
| `WheelsDetached` | UTINYINT/UTINYINT/UTINYINT/UTINYINT | — |
| `Yellow Flag State` | UTINYINT | — |

События имеют ts DOUBLE; первая строка может означать начальное состояние. Количество строк не равно числу происшествий. Частота on-change не является регулярной частотой; пустая unit не восполняется предположением.

Lap, Lap Time и In Pits используются только после проверки структуры, единиц и часов. Best LapTime может быть перенесённым состоянием. Нулевое время не объясняет причину; независимая спортивная сертификация не заявляется.

ABS/TC не доказывают вмешательство системы, блокировку или причину потери времени. LastImpactMagnitude BOOLEAN не даёт физической величины удара. Для WheelsDetached, SurfaceTypes и флагов неизвестные enum и порядок компонентов не угадываются. Path Lateral/Track Edge не превращаются в track limits. Постоянное false/0 не доказывает отсутствие системы; конфликт BOOLEAN и unit % запрещает восстановление шкалы.

Collision, off-track, understeer/oversteer, wheel lock/spin и ABS/TC intervention diagnoses остаются недоступными без versioned semantics, независимой проверки, единиц и временной привязки. Исходные имена и состояния можно показывать с явным неизвестным смыслом. Математика не изменяется ради выразительности UI.
