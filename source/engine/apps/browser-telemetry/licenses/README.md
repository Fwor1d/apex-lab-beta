# Лицензии компонентов браузерного эксперимента

DuckDB-Wasm: `@duckdb/duckdb-wasm` 1.32.0, MIT, официальный commit `a20b8290e79e37a7b914e62621aa412d69ba95fc`. Текст `duckdb-wasm-MIT.txt` получен из [официального исходника этой версии](https://github.com/duckdb/duckdb-wasm/blob/a20b8290e79e37a7b914e62621aa412d69ba95fc/LICENSE). В пакет npm текст лицензии не включён, поэтому он сохранён отдельно. Встроенное ядро DuckDB этой версии — 1.4.3.

Apache Arrow JavaScript 17.0.0 распространяется под Apache-2.0. `apache-arrow-LICENSE.txt` и `apache-arrow-NOTICE.txt` скопированы без изменений из установленного официального npm-пакета. NOTICE сохранён полностью, включая уведомления о компонентах общего проекта Arrow.

Также сохранены лицензии зависимостей Arrow, которые могут входить в браузерный bundle: FlatBuffers (Apache-2.0), tslib (0BSD и уведомление Microsoft), SWC helpers (Apache-2.0), json-bignum (MIT). Точные версии закреплены в корневом `package-lock.json`; исходные тексты взяты из установленных пакетов.

SHA-256 по частям вычисляется через js-sha256 0.11.1 (MIT); его неизменённый текст лицензии сохранён в `js-sha256-MIT.txt`.

Эти уведомления должны входить в статическую сборку вместе с JavaScript, Worker и Wasm. Здесь нет персональной телеметрии.
