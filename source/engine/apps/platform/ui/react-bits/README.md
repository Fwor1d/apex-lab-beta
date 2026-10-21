# React Bits в APEX LAB

Источник: David Haz, [react-bits](https://github.com/DavidHDev/react-bits), commit `43591e8b3fa327d45633b4e8239ff6742ef706ef`.
Лицензия: MIT + Commons Clause, полный текст в `../licenses/react-bits.txt`.
Оригинальные SHA-256 перечислены в `PROVENANCE.json`.

CometDial: сохранены геометрия, константы/интеграция spring, velocity-dependent comet и CSS. Дополнения ограничены loader/read-only ARIA, неопределённым readout и визуальной настройкой motion. Indeterminate sweep — декоративное движение исходного spring между двумя значениями, без процента выполнения. SpotlightCard: оригинал, при grain=0 не назначается неиспользуемая data-URI текстура ради строгой CSP. В APEX LAB grain/ambient/flare выключены; React монтирует только декоративный слой, реальные ссылки остаются HTML.

JSX не входит в static artifact. React/React DOM/Motion — одна сборка, ленивый ES module. Компоненты используются как часть приложения, не распространяются как отдельная библиотека/платный набор.
