# Secure source checkpoint — 20 октября 2026

Цель: сохранить завершённую Phase 1 и подготовить её исходники к разработке из GitHub. Версия 0.13.0-phase1; UI, AppState/playback и production runtime модули не изменены. Phase 2 не начата.

Репозиторий: https://github.com/Fwor1d/apex-lab-beta, public, main=`46c43e416fa0d283651aeb7ba06931098f293d66`. На момент аудита — два коммита static beta; production HEAD=`0f39b71cc83b772ead39081c100a606a3ecf25da`, 17 коммитов. Пересечение историй — 0. Git нового локального проекта исходно не имел коммитов/remote.

Стратегия: отдельный безопасный локальный checkpoint `codex/unified-foundation`; отдельная ветка `codex/secure-foundation-cloud` с единственным родителем remote main. Проверенное дерево приложения добавляется в source/. Корневые static файлы старой beta не заменяются; добавляются только README/AGENTS, devcontainer, CI и Git hygiene. Local checkpoint не становится предком удалённой ветки: исходная production история не публикуется. Merge unrelated histories, force push, обновление main и merge PR не используются.

Сканирование проводится до публикации: явный allowlist staging, инспекция index, Gitleaks 8.30.1 из официального release с проверкой SHA-256, проверка private paths/database magic и всех newly reachable Git blobs/commit metadata. Логи не содержат открытых credential values и остаются вне Git. Первые два Gitleaks срабатывания вручную подтверждены как ложные: enum comparison coastDecelerationMps2 и точный SHA файла visual-tokens. Исключения ограничены конкретными строками и путями, стандартные правила остаются включены. Контрольные случайные фиктивные generic/GitHub ключи обнаруживаются даже в том же файле.

Из публичного дерева удалены абсолютные личные пути и подробные результаты частных заездов. Исходные отчёты и три private oracle assertion bodies сохранены только локально; тела assertions не менялись. Все synthetic assertions и все app/engine runtime файлы побайтно сохранены. Нет настоящих DuckDB, private oracle, profiles, browser profiles, screenshots, credentials, node_modules, dist или source maps.

Проверено локально: 239 pass / 0 fail / 3 explicit private skips; 12 Chromium сценариев с approved reference и 12 WebKit сценариев без внешнего reference; обе static bases; security/provenance checks. Защищённые 604 production/60 prototype файлов проверены по hashes и Git status. Личные записи не открывались и не копировались в ходе этой задачи.

Codespaces/Codex Cloud конфигурация и точные команды: CLOUD-DEVELOPMENT.md. Это не утверждение о запущенном пользовательском cloud environment. Remote CI результат проверяется отдельно после push; сам workflow не доказывает успешный run. Итоговые SHA/PR/CI URL выдаются в отчёте задачи и доступны в GitHub, не подставляются заранее.

Расхождение с исходным заданием: GitHub Pages уже был включён, legacy build из main:/, HTTPS enforced. Новый workflow не имеет deployment/write permissions, feature-ветка не публикует новый UI на Pages. Без отдельного решения прежняя настройка сохраняется. Отсутствие новой публикации не означает, что ранее включённый Pages выключен.

Licensing: root LICENSE у оригинального APEX LAB/remote не найден; новый не добавлен. Все third-party notices сохранены. React Bits MIT+Commons Clause и ODbL требуют отдельного внимания в будущей proprietary модели; подробности LICENSING-PLAN.md. Hardware acceptance и реальные данные остаются вне текущего результата.
