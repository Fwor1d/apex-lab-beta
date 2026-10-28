# Phase 3 — настоящий A/B анализ

## Владение данными

RecordingSource использует прежний AnalyzerWorker: open → profile(A) → profile(B) → compare(A,B). DuckDB после open закрыт; повторной SQL-нормализации нет. Действия выполняются последовательно. Очередь сверяет source epoch и analysis epoch до/после RPC, пропускает устаревшие запросы. AppState независимо сверяет source identity и generation перед публикацией. При смене пары playback останавливается, старые cursor/readouts очищаются. При отмене сравнения сессия сохраняется, при release source.stop завершает Worker и pending requests.

Main thread сохраняет два активных профиля и один comparison; результаты Coach/extended, автоматически вычисленные старым Worker, не включаются в UI и не удерживаются новым адаптером. Summary в AppState содержит только идентичность, поля качества, численные итоги и небольшие descriptors. Полные массивы не попадают в snapshot, локальное хранилище или сетевой запрос. Source samples(id,start,end) возвращает исходные aligned точки выбранного окна; сетка ограничена прежним engine guard. Графики используют borrowed typed arrays, не samples на каждом кадре.

## Численные границы

`engine/.../analysis.js` остаётся authority: grid_m=2, max_distance_gap_m=25, max_time_gap_s=0.25. Адаптер проверяет профиль существующим portable contract, source/session/lap/hash/kind, pair ответа, типы Float64Array, длины, монотонную сетку, policy и согласованность покрытия. Не меняет массивы, policy, interpolation, origin или sign.

Положительное B−A означает, что B медленнее. Четыре величины показываются отдельно:

- Разница записанных полных Lap Time из validation.
- Последняя конечная deltaS на общей сетке с её дистанцией.
- deltaS у текущего cursor, с пропусками и исходной нормализацией.
- Изменение deltaS между границами выбранного непрерывно валидного интервала.

При plateau engine deltaS остаётся NaN, UI получает null. Speed/brake/throttle/steering продолжают отображаться там, где конечны. Нет предположения, что common-end равен полному кругу. Единицы внутри: m/s, m, s, ratio и signed ratio. UI переводит скорость ×3.6, педали и нормированный ввод руля ×100 один раз. Угол колёс/yaw не выводятся.

## Измеренное время B

`measuredMapping` строит кусочно-линейную привязку по последовательным фактическим timeS/distanceM. Дубликаты времени или дистанции отмечаются неоднозначными, missing разрывает runs. Убывание времени/дистанции отклоняет mapping целиком. Связь требует dt>0, ds>0 и прежних максимальных gaps. За границами интервала нет экстраполяции или nearest-point fallback. Область ограничена общим диапазоном сравнения.

Manual seek хранит точное значение distance в tagged cursor; time вычисляется из него. Playback хранит elapsed time B, distance вычисляется из него. Один прежний `core/playback.js` владеет RAF. `advance` ограничен концом текущей непрерывной B-области, поэтому даже большой кадровый шаг не перепрыгивает gap. Изменение view не создаёт новых часов; hide/resume не догоняет скрытое время. Нет повторных RPC во время playback.

## Отображение и качество

Статусы import и analysis независимы: импортированная сессия остаётся loaded при unavailable/failed comparison. Analysis имеет pending/ready/partial/unavailable/failed. Для неподключённой пространственной карты, setup, новых советов, отчётов и Driving Lab сохраняются явные границы. DEMO использует прежние presentation modules; REAL не вызывает synthetic values/time/delta/geometry.

Real Overview сохраняет R5.2 иерархию lap results, comparison readouts, timing и context. Pit Wall сохраняет графики и HUD с cyan A/amber B, сплошной/штриховой линиями. Все inputs относятся к одному AppState. Статический DOM HUD не обновляется на паузе.

Каждый канал получает подготовленную один раз connectivity mask, включая native gaps, попавшие между узлами общей сетки. Display min/max envelope сохраняет исходные точки, хронологию, экстремумы и границы разрывов. Один SVG path на серию; отдельный DOM-узел на sample не создаётся. Децимация влияет только на картинку, исходный numerical comparison неизменен. Валидность всех точек сетки не доказывает непрерывность между ними: continuityBreaks учитывает отдельные разрывы и делает status partial даже при coverage=1. Интервальная дельта через такой разрыв недоступна. Prefix counts позволяют проверять интервал без полного обхода сетки на каждом кадре.

## Тестовые уровни

Native synthetic DuckDB остаётся kind=synthetic, source_verified/certified_valid=false; исходный Worker запрещает разные A/B для неё. Этот production guard не снят. Поэтому portable analytics E2E использует явно synthetic test subclass/transport и настоящий protected compare на synthetic profiles. Эти два тестовых модуля выдаёт только harness, они не входят в dist. Полный File→Worker→eligible pair путь, обе пары и full-array Python parity проверяются отдельно на шести локальных authentic файлах. Отсутствие private input — явный skip, не pass.
