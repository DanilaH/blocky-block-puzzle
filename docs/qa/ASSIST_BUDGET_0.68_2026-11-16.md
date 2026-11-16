# D94 / preview0.68: итоговая трасса и один конечный бюджет помощи

Первая согласованная итерация приложенного [ТЗ](../tasks/COMMERCIAL_DIRECTOR_2026-11-15.md).
База5390af7/publicdc26d27,последняя0.67,не main. Её полный CI43815781553
уже success:339 unit,261 browser,31 focused,Android и2 emulator tests.
Правка кольца0.67 и полный праздник сохранены. Default director-v2;composition
v1/v2 исторические отдельные ручные варианты,HOLD;audience rollout OFF.

## Что реально изменилось

|Было|Стало|Зачем/версия|Проверка|
|---|---|---|---|
|requested/actual/source терялись между генератором,post-process и записью|опциональный DecisionTrace прямо в существующих move/checkpoint PlayCapture|schema1,только при opt-in capture;без новых массовых analytics/save полей|exact A/A по frozen0.67 contexts;1120 старых human moves|
|не виден последний composition override|initial/final IDs,reason/accepted,proof,work и RNG до/после;исходный board/history для replay|детерминированный finalDecision/replayDecision,никакого SDK/часов при replay|composition и повреждённые reasons/IDs/RNG;реальный worker export/replay|
|prepare заново включает payoff,all-clear снова включает rest,relief повторяется|один manual director-budget-v1 с конечными extra rewards|один candidate/config assist-budget-v1;нового director engine нет|64 dev+64 untouched holdout runs,лимиты/work/proofs|
|основная конструктивная разыгрываемость и обещанные recovery смешивались бы с помощью|целая ordinary тройка бесплатна;early12 выдач и3 recovery идентичны control|сохранить обычный контракт и earned value,не продавать safe за credits|exact early/recovery иreceipt/save/reload/duplicate/cancel regressions|
|ручной режим мог быть плохо читаем в Classic|тот же dropdown,короткая «Конечная помощь»,тёмный текст на существующем белом поле|локальный подтверждённый contrast bug;без нового арт-дирекшена|320/390px,contrast≥4.5,48px control,скрин иреальная новая партия|

DecisionTrace не хранится в каждом GameState:worker возвращает его только по
captureDecision,контроллер добавляет в запись после durable save. Callback
диагностики не определяет игровой исход. Core control не расходует новый RNG
и не меняет свой GameState/hash. Стартовая трасса пишется,если запись уже была
включена до новой партии;начатая посреди лотка запись честно начинается с
checkpoint,без выдуманного предшествующего RNG. Размер capture по-прежнему
ограничен800000bytes,невыгруженные данные защищены прежними guards.

## Кандидат,не новая основная выдача

Конфигурация и gates заморожены локальным checkpoint f0798b6 ДО dev/holdout. [Протокол](assist-budget-2026-11-16/PROTOCOL.md),
[audit фактических источников](assist-budget-2026-11-16/CURRENT_STATE_AUDIT.md).
Никакой настройки по holdout D91 или новому раскрытому holdout не было.

- Первые12 выдач(36 постановок) ивсе3 post-revive recovery прежние по tray/
  RNG/witness/controller. Они конечны и не обновляются от record/new-day/resume.
- Затем ordinary использует прежний constructive beam,линии/геометрию/нагрузку,
  без бесконечного нового rest/payoff/exact-clear. Safe whole hand не требует credit.
- Дополнительный reward-biased лоток имеет общий budget5,source caps reward5/
  relief2,не менее2 завершённых лотков между применениями. Два bounded поиска
  ≤11900work каждый+два исполнения witness,общий≤24000.
- Тратим1 только за выбранную отличающуюся тройку,чей whole witness даёт
  дополнительную линию илиall-clear против конкретного ordinary incumbent.
  Rejected/requested/attempted/applied раздельны;сохраняем RNG выбранного плана,
  RNG отвергнутой альтернативы показан в trace и не продвигает игровой seed.
- Credits сохраняются атомарно с ходом,не восстанавливаются от очищения,
  фон/возврат/revive/даты. Paid-earned права иcooldown не конфликтуют:
  promised recovery имеет приоритет ине зависит от discretionary budget.
- Новая policy/config записана в новой выбранной партии;resume не переназначается.
  Старый composition experiment не переопределён,новый future assignment отдельный,
  стабильный иOFF. Никаких ad-value/readiness/time-to-die входов.

## Сравнение

Baseline64 runs(v2/composition-v2 HOLD),dev64 иholdout64:192 synthetic launches,
32168 moves. Четыре стиля получают только board/tray,не witness/director/budget.
Одинаковый независимый player RNG;cap300,без revive. Упёршиеся вcap — censored,
не поражения. Стартер control/candidate одинаковый:новые рецепты сюда не смешаны.

|Выборка/игрок|Ходы v2→candidate|Хвост после72|Ordinary clear-moves/ход|All-clear/ход|
|---|---:|---:|---:|---:|
|dev bounded|268→268|0→0(нет экспозиции)|.463→.463|.022→.022|
|dev clear|1425→1228|860→673(−21.7%)|.378→.471|.081→.043|
|dev three|2400→2400|1824→1824(censored)|.329→.463|.164→.085|
|dev lapse|1556→1422|1029→926(−10.0%)|0.451→0.508|0.063→0.032|
|holdout bounded|381→343|32→0|.496→.504|.008→.009|
|holdout clear|1832→1307|1299→781(−39.9%)|.396→.458|.064→.047|
|holdout three|2400→2400|1824→1824(censored)|.280→.455|.186→.090|
|holdout lapse|1247→1154|752→671(−10.8%)|.422→.471|.082→.051|

Ранние смерти≤36 совпали в каждой группе. Все frozen gates прошли;никаких
technical fallback в128 matched runs,максимальный work23084. Дополнительная
помощь по единому counterfactual определению снизилась уthree с59–66 до3.8–4.1
на100 поздних выдач. В control эта метка вычислялась отдельно после измеряемого
хода;это одинаковое QA-определение дополнительной наградной возможности,не
кнопка/SDK impression и не гарантированное следование игрока witness.

Уthree все32 matched партии осталисьplaying на300:конечность сильной игры
не доказана ине требуется таймер смерти. Разница clear/lapse на8seeds — модельный
результат,не оценка человеческого удовольствия/retention/revenue. Candidate
**HOLD для ручной человеческой пробы**,не ACCEPT/default отзелёных автотестов.
Публичные данные: [агрегаты baseline/dev/holdout](assist-budget-2026-11-16/comparison-summary.json).
Полные синтетические состояния и decision traces остаются в ignored artifacts;
воспроизводятся scripts/assist-budget/baseline.mjs и compare.mjs. Frozen A/A
контексты строятся из публичных seed recipes и проверяются по старым хешам.
Публикуемая история не включает исходные записи или полные игровые снимки.

Воспроизведение в ignored artifacts (сначала `mkdir -p artifacts/assist-budget`):
`node scripts/assist-budget/baseline.mjs artifacts/assist-budget/baseline.json`,
`node scripts/assist-budget/compare.mjs dev artifacts/assist-budget/dev.json`,
`node scripts/assist-budget/compare.mjs holdout artifacts/assist-budget/holdout.json`,
`node scripts/assist-budget/trace-cost.mjs artifacts/assist-budget/trace-cost.json`.
Последовательность dev/holdout отражает уже замороженный эксперимент;
повтор результатов не разрешает настройку по этим seed.

## Проверки и стоимость

352 unit/TypeScript/build/assets PASS.15 targeted browser PASS:manual choice,
save/resume,actual refill Worker,один расход,export с полным replay,прежние
commercial/capture/save-atomicity случаи. Дополнительный compact320px повтор
проверяет читаемый dropdown. Старые4 private записи найдены заново:402+261+
185+272=1120moves,exact hashes плюс независимые клеточные переходы PASS.
Исходные файлы остаются вignored private-inputs;в Git не добавлялись.

Compute вserial Node,traceON:refill p95 control→candidate devthree10.98→13.69ms,
holdoutthree16.45→19.86ms;process CPU user+system13.68/19.68ms уcandidate,
отдельно отwall. Некоторые выдачи дороже:фиксированный work cap не равен
нулевой стоимости. Это не worker wall lifetime,main-thread latency или phone FPS.
Отдельная opt-in trace проба42/42 с чередованием далаp95 off38.35/on40.33ms
на выбранных контекстах;не считать разницу2ms гарантией устройства.
300 synthetic witness-driven moves дают224273bytes capture,максимальная trace1944
bytes,current model902bytes,credits конечны. [Агрегаты](assist-budget-2026-11-16/comparison-summary.json).
Это проверка bounded data и replay,не доказательство отсутствия всех утечек.

Preview0.68/code68,прежний package/signer,demo ads,analytics OFF. Android/CI/APK
ещё проверяются в отдельной поставке. Телефон/human gate открыт:ощущения
помощи/наград/задач,плавность refill,update/resume иреальный demo SDK.
AppMetrica кабинет отложен;монетизация/retention не объявляются улучшенными.

Следующие части большого TZ:P1-B новые challenge/фазы/старты,P1-C другое окно
revive,P2 ad cadence — отдельно,после этой проверки. Они не включены молча.
Использованы pass4+geometry correction+iOS delta иChallenge/Experimentation
guidance ca427723;runtime5450f9d прежний. **KIT IMPACT NONE**:изменение политики
Blocky,не новый универсальный API. Kit/его research файлы не менялись.
