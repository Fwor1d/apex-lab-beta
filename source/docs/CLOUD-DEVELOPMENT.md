# Разработка APEX LAB Phase 3

Версия приложения `0.15.0-phase3`. DEMO работает самостоятельно; локальный File → Worker импорт подключён к Sessions. Графики и playback подключены для допустимой пары; в облаке используются только синтетические тестовые данные. Нужен Node.js >=22 (окружение закрепляет major 22) и npm. Python, личные записи, API-ключи и .env не требуются. Обязательных environment variables нет, поэтому .env.example не создаётся.

## Расположение исходников

В GitHub-ветке `codex/real-ab-telemetry-phase3` приложение находится в `source/`. Корень репозитория сохраняет прежнюю static beta. Её не запускать вместо нового приложения и не заменять при сборке. В самостоятельном локальном checkpoint package.json находится непосредственно в корне проекта.

## Обычный clone

```sh
git clone --branch codex/real-ab-telemetry-phase3 https://github.com/Fwor1d/apex-lab-beta.git
cd apex-lab-beta/source
npm run setup:cloud
npm test
npm run dev
```

Адрес: http://127.0.0.1:4190/apex-lab/. Dev-сервер отдаёт только dist, разрешает GET/HEAD и слушает loopback. После изменения исходников выполнить `npm run build -- --base=/apex-lab/` и обновить страницу; автоматического hot reload нет.

setup:cloud проверяет Node, выполняет `npm ci --ignore-scripts --no-audit --no-fund` с локальным cache, build, check:build, check:security и check:provenance. Версии/integrity из package-lock не изменяются. Установка esbuild использует закреплённый platform package; произвольные lifecycle scripts отключены.

## GitHub Codespaces

Открыть указанную feature-ветку → Code → Codespaces → создать окружение этой ветки. Корневой `.devcontainer/devcontainer.json` использует официальный Node22/bookworm image и выполняет setup:cloud. В терминале:

```sh
cd source
npm test
npm run dev
```

Открыть forwarded port **4190**, добавить `/apex-lab/` к его URL. Оставить видимость порта **Private**. Это preview разработки, не Pages deployment. Реальное создание Codespace не входит в автоматическую проверку конфигурации; расходы аккаунта не активируются этим checkpoint.

Официальные инструкции: [Node devcontainer](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/setting-up-your-nodejs-project-for-codespaces), [port forwarding](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace).

## Codex Cloud

Создать environment для `Fwor1d/apex-lab-beta`, выбрать feature-ветку `codex/real-ab-telemetry-phase3`, Node22 и приватный доступ к окружению. Если checkout начался с main, сначала получить и выбрать feature-ветку: main ещё содержит только старую static beta.

Команды установки из корня репозитория:

```sh
cd source
npm run setup:cloud
npm test
```

Команда запуска из source: `npm run dev`. Проверка готовности: HTTP GET `http://127.0.0.1:4190/apex-lab/`. Runtime не нуждается в интернете; setup требует npm registry. Для установки Playwright отдельно требуются официальные browser-download hosts. Не добавлять private oracle, записи и секреты.

Указать приведённые команды в настройках установки среды; npm run dev запускает локальный preview. Сначала проверить setup. Это не публикация приложения. Локальные personal skills автоматически не предполагаются; проектные AGENTS.md доступны в Git. Новое Cloud environment в этой задаче не создаётся, его успешный запуск не заявляется.



## Проверки

```sh
npm test
npm run check:security
npm run check:provenance
npm run check:publication
npm run build -- --base=/apex-lab/
npm run check:build
```

Для Chromium (Linux требует системных библиотек через `--with-deps`):

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/playwright" node node_modules/playwright/cli.js install --with-deps chromium
npm run test:e2e
npm run test:import:e2e
npm run test:analysis:e2e
```

Для WebKit установить аналогично `webkit`, затем `APEX_BROWSER=webkit npm run test:e2e`. Системный Chrome можно явно выбрать через `APEX_BROWSER_CHANNEL=chrome`; он больше не является обязательной зависимостью.

Все 12 функциональных E2E-сценариев и 4 viewport проверяются без внешнего прототипа. Сравнение со старым R5.2 включается только явно: `APEX_REFERENCE_ROOT` указывает на read-only прототип; без него report честно отмечает пропуск reference comparison. Отсутствующий указанный reference приводит к ошибке, а не тихому fallback.

## Переменные и локальные исключения

| Переменная | Назначение |
| --- | --- |
| PORT | Dev-порт; default 4190 |
| APEX_BROWSER | webkit либо Chromium по умолчанию |
| APEX_BROWSER_CHANNEL | Необязательный установленный channel, например chrome |
| PLAYWRIGHT_BROWSERS_PATH | Cache браузеров; harness default .cache/playwright в приложении |
| APEX_REFERENCE_ROOT | Только локальная read-only сверка R5.2 и side-by-side snapshots |
| APEX_PRODUCTION_ROOT | Только локальная сверка 604 original hashes/HEAD/status |
| APEX_PRIVATE_TESTS + APEX_BROWSER_ORACLE | Явный local-only запуск трёх приватных assertion bodies с частным oracle; не задавать в cloud/CI |

Portable provenance всегда проверяет включённые immutable copies и все locked dependency versions/integrities. Внешние 604/60 original hashes проверяются дополнительно при заданных путях. Privacy-редакции docs/tests имеют отдельные current hashes; runtime engine не исключён из проверки.

Worker/Wasm eh/mvp копируются из locked DuckDB-Wasm при build и раздаются локально. Native pipeline сохранён в engine, но в DEMO не запускается и не импортирует реальные файлы. SW/PWA нового shell, реальные траектории и аппаратная приёмка остаются вне Phase 3.

CI не имеет deployment jobs, Pages/write permissions, secrets или telemetry inputs. Существующий Pages старой beta до этой работы был включён на main; feature-ветка не обновляет этот сайт. Merge и переключение Pages требуют отдельного решения.

## Native import в облачных проверках

`npm run test:import:e2e` создаёт только synthetic DuckDB через уже закреплённый Node/Wasm пакет, затем открывает её настоящим browser File/Worker pipeline. Python не требуется. `APEX_BROWSER=webkit npm run test:import:e2e` запускает ту же проверку в WebKit. Для WebKit нужны его browser binaries и системные зависимости.

Реальные записи и oracle не добавлять в Cloud, Codespaces, Git или CI. Опциональные `APEX_REAL_BROWSER`, `APEX_AUDIT_ROOT`, `APEX_LMU_DATA_ROOT` и `APEX_BROWSER_ORACLE` предназначены только для авторизованной локальной среды; см. TESTING.md.

Worker/Wasm assets находятся в dist/engine и dist/engine/apps/browser-telemetry/vendor; пути относительные. DEMO не загружает Wasm. Все runtime зависимости обслуживаются тем же static origin. CSP не ослаблена, COOP/COEP не требуется исходному single-thread pipeline.

Phase 3 draft PR направлен в `codex/real-lmu-import-phase2`; PR #1/#2, их ветки и main сохраняются. Cloud configuration, clean-clone setup и GitHub Actions — разные уровни проверки. Реальные Codespace/Codex Cloud environments в этой задаче не создаются; их запуск не заявляется.

## Анализ Phase 3

`npm run test:analysis:e2e` проверяет synthetic profiles → неизменный compare → adapter/UI/playback. Native synthetic файлы по-прежнему не получают certified eligibility: test-only transport явно изолирован от dist. Полный File/Worker A/B проверяется только локально на разрешённых authentic записях. Все три browser suites запускаются после build; CI не нуждается в внешнем прототипе или private oracle.
