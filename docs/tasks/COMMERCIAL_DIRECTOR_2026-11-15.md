# Blocky — ТЗ на развитие директора партии и коммерческой логики

**Дата:** 15 ноября 2026 · **Статус:** инженерное ТЗ / документ на реализацию и сравнение, **не включённый rollout**  
**Consumer:** [`DanilaH/blocky-block-puzzle`](https://github.com/DanilaH/blocky-block-puzzle) · проверенная рабочая линия **D92 / preview 0.66** (`fix/floating-ownership-20261115`, не древний `main`).  
**Research:** [`DanilaH/mini-games-kit/research/games/block-puzzles`](https://github.com/DanilaH/mini-games-kit/tree/main/research/games/block-puzzles) · pass4 + iOS + visual/performance.  
**Авторство примеров:** алгоритмы в `reference/clean-room-policies.ts` написаны заново по установленному поведению; это **не декомпилированные исходники конкурента**.

## 0. Итоговое требование и границы

Сделать игру, в которой партия **меняется по структуре задач**, ход игрока имеет значение, очистки приятны, но не бесконечно лёгки; поражение понятно, а продолжение после rewarded приносит реальную игровую ценность. Доход зарабатывается **на естественных остановках** и добровольном продолжении, при соблюдении ограничений рекламы. Измерять выручку, возвраты и уход после рекламы, а не подгонять партию к единственному рекламному KPI.

**Обязательный исходный контроль:** `director-v2` остаётся default; `composition-v1/v2` остаются экспериментальными (D91: HOLD/manual-only/rollout OFF). D87 исправил revive с целым witness и transactional reward; D92 исправил floating lifecycle без изменения экономики. Сохранять active save, history, record, earned-but-unclaimed revive, hint receipts, scoring и grace-v2. AppMetrica в preview **OFF**, Yandex Ads **demo**. Не смешивать стендовые данные и реальные доходы. **Никакого нового глобального игрового движка, ML-сервера, второй системы director или переписывания Phaser.**

**Важный сохранённый запрет продукта:** `AGENTS.md` и D02 требуют «не привязывать выдачу к рекламе». Поэтому обнаруженный у конкурента ad-price-triggered death — **описанный исследовательский факт, не production-feature**. Включать намеренно безвыходные тройки, скрыто ухудшать выдачу перед рекламой или использовать eCPM для выбора игровых фигур в рамках этого ТЗ запрещено. Чтобы изменить этот контракт, нужно отдельное явное изменение продуктового решения, этическая и коммерческая проверка. Наличие чужого кода или просьба использовать его как референс такого решения не заменяют.

**Никакого чужого source drop:** не импортировать декомпилированные классы, SDK-ID, брендовые ассеты, ad unit IDs, лицензируемые тексты. Из источников переносим проверенные *условия/состояния/контрольные случаи* и самостоятельно реализуем минимальные абстракции. Для повторного исследования сторонние входы сохранять отдельно с URL, hash, версией и provenance; не включать исходные APK в выпуск и общий kit.

## 1. Обязательный вход агенту (P0 audit, ДО изменений)

1. Открыть актуальные `AGENTS.md`, `README.md`, `docs/DECISIONS.md` (последние D87–D92 и D02–D08), `docs/ROADMAP.md`, `docs/SESSION_HANDOFF.md`, релевантный Task Router и kit pin. Проверить реальный HEAD/working tree, незавершённые ветки и сохранения. **`main` от 23 октября — не рабочая игровая база**. Пин kit runtime и пин research-guidance различаются.
2. Прочитать [pass4 closure](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/BLOCK_PUZZLE_PASS4_CLOSURE.txt), [исправление геометрии](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/pass4/board/RECOVERY_CORRECTION.md), [pass4 task](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/BLOCKY_AGENT_ADDENDUM_PASS4.txt), [iOS delta](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-ios-commercial-rules/BLOCKY_RESEARCH_DELTA.md). Важна **runtime ShapeInfo**: прежний R-каталог зеркалил асимметричные фигуры; нельзя повторить эту ошибку в witness.
3. Составить `CURRENT_STATE_AUDIT.md` таблицей `требование / уже есть / отсутствует / ссылка на код+тест / нужно ли менять`. Проверить реальный путь `start → deal policy → generator → fallback → post-process → final tray → move/clear/save → terminal → revive/ad/restart`; сохранять уже имеющиеся class/module API.
4. Инвентаризировать все существующие источники помощи: opening, ранний/lategame recovery, low-space, combo, full-clear, post-revive, performance fallback. Для каждого: trigger, scope, cap, cooldown, consumption, reset, текущая конфигурация. Сравнить *общий* эффект, а не каждый trait отдельно.
5. До фиксации новых thresholds выполнить исходные baseline-моделирования на `director-v2` и D91 `composition-v2` как независимом **HOLD** кандидате с неизменным набором seed, минимум тремя стилями ботов и реальным пользовательским replay. Не использовать D91 holdout для настройки следующего алгоритма. Сохранить метрики и незавершённые партии как censored.

**Выход P0:** diff возможностей и реальный план минимальных изменений, включая контрольные снимки версий/хешей/схем сохранения; не завершать всё лишь аудитом.

## 2. Раздельные конфигурации (без запуска всего сразу)

Предлагается пять независимых экспериментальных границ. Они добавляются поверх существующего `director-v2` и связанного кода, не образуют новую архитектуру.

| Флаг | Control | Candidate | Условие запуска |
| --- | --- | --- | --- |
| `decisionTraceV1` | существующая диагностика | единое окончательное объяснение выдачи и replay | диагностический sampling; игровое поведение идентично |
| `assistBudgetV1` | фактические D91/D92 лимиты | глобальный бюджет помощи + caps/cooldown | только после A/A deterministic equivalence |
| `challengePhasesV1` | существующий директор | доказанные последовательные и выборные задачи с конечными фазами | после трассировки, затем отдельное matched сравнение |
| `reviveWindowV1` | D87 witness по факту | 1–2 последующие защищённые раздачи с конечной защитой | отдельное испытание, не смешивать с pressure |
| `adCadenceV1` | текущий demo/native/правила рекламы | soft-shields и явные квоты запросов/показов | SDK test/physical validation; preview demo/off |

Stable assignment при новой партии: сохранённые `experimentArm` и `configVersion` не меняются на resume, new-day или обновлении приложения. **Незавершённая партия не мигрирует на новый баланс молча**. Набор flags должен воспроизводиться в replay. Для клиента без нового schema ключа действуют контрольные правила и versioned migration.

Роллаут: OFF по умолчанию; отдельно включаемое ручное сравнение; только потом реальный рандомизированный эксперимент. Группы для `assistBudgetV1`, `challengePhasesV1`, `reviveWindowV1`, `adCadenceV1` не объединять в одну, пока нельзя оценить вклад каждой. Конфигурации и TTL должны иметь свои версии. Никаких неограниченных TODO-вариантов.

## 3. Контракт одного итогового решения (`DecisionTrace`)

Существующие domain/replay-поля расширить, не дублировать в параллельном журнале:

```ts
interface DecisionTrace {
  schema: 1;
  sessionId: string; gameId: string; dealIndex: number;
  policyRevision: string; configVersion: string; experimentArm: string;
  boardBeforeHash: string; boardAfterHash?: string;
  seedBefore: string; seedAfter: string; // RNG snapshots, not Math.random()
  score: number; startHighScore: number; phase: Phase;
  activePlayMs: number; completedTrayIntervalsMs: readonly number[];
  requestedFamily: string; selectedFamily: string;
  initialPieceIds: readonly string[]; finalPieceIds: readonly string[];
  overrides: readonly { from: string; to: string; reason: Reason; accepted: boolean }[];
  validation: { kind: 'SOLVABLE'|'UNSOLVABLE'|'UNKNOWN_TIMEOUT'|'UNKNOWN_PRUNED'; witness?: readonly Move[]; explored: number; budgetUsed: number };
  assistance: { source: string|null; requested: boolean; applied: boolean; before: number; after: number; cooldownUntilDeal: number|null };
  cpuFallback?: { reason: string; candidateId: string };
  adOpportunity?: { placement: string; allow: boolean; reason: string }; // НЕ impression
}
```

Идентификаторы/хеши — пример формы, не новая библиотека. Полные board snapshots, временные отметки/календарная дата, внешняя готовность, test model outputs, старые counters и расход RNG нужны **локальному replay**, но не массовым production событиям. Никаких рекламных ID пользователя. `decisionId` связывает все стадии; при двух повторных hook-вызовах различать `hookCallIndex` и `rngDrawIndex`. Один seed без истории и внешних входов недостаточен.

**Правило replay:** одинаковые `board + tray + RNG state + config + recorded external inputs + history` дают те же final IDs и reasons **после всех overrides**; не перезапрашивать SDK, сервер или часы. Requested family не равна actual final family. Значения `UNKNOWN_TIMEOUT` и `UNKNOWN_PRUNED` никогда не превращать в доказанную неразрешимость.

**UI не зависит от трассы.** Для production поддерживать ограниченный sampling/конфигурацию, а не сериализовать каждый узел поиска. Отдельно измерять wall time и CPU worker; не выдавать ожидание worker или IndexedDB за занятие main thread.

## 4. Бюджет помощи — основной кандидат против бесконечной лёгкой партии

### 4.1. Предложенная стартовая конфигурация (ГИПОТЕЗА, не «числа конкурента»)

Это **экспериментальный пример**, не production tuning. Предварительная конфигурация для сопоставления с текущим baseline:

```ts
const assistBudgetCandidate = {
  runCredits: 5,                 // единый счётчик реально применённой помощи в одной партии
  openerCap: 1,                 // стартовое облегчение только при запуске новой партии
  recoveryAfterBadRunCap: 1,    // не в текущей партии при resume
  lowSpaceOrComboCap: 2,       // общий cap для чередующихся источников
  lateCap: 1,
  minDealGap: 2,                // cooldown по завершённым лоткам, не по кадрам
  postReviveSeparateCap: 1,    // расходуется отдельно, никогда не пополняет runCredits
  resetOn: 'NEW_GAME_ONLY',
} as const;
```

**Важно:** значения выбраны для разработки тестов, не на основе статистически доказанного оптимума. Сначала проверить их соответствие реальным D91 budgets и baseline-дистрибуции. Если перевод текущего поведения в эти числа приведёт к ранним смертям, кандидат отклоняется; не менять control. У сильного игрока может быть длинная партия из-за мастерства — это не дефект само по себе. Мы устраняем автоспасение без конца, а не ставим произвольный таймер смерти.

### 4.2. Правила

- Помощь расходуется **после применения итоговой раздачи**, если реально изменила исход. Запрос trait, отклонённый кандидат, или чужой fallback не расходуют этот источник. Логировать `requestedBy`, `appliedBy` и `assistanceTag` отдельно.
- Все источники, которые делают поле легче/увеличивают долю разрешимых лотков/создают clearance, расходуют общий runCredits и собственный scope cap. Нельзя чередовать opener → combo → low-space → late бесконечно. Декоративный score-bonus не считается помощью для лотка.
- Полная очистка, увеличение рекорда, новый календарный день, фон/возврат, replay и revive **не пополняют** текущую основную квоту. Новая партия получает новую квоту, с учётом отдельной истории плохих стартов. `postReviveSeparateCap` имеет строгий конец и не обновляется от повторного callback.
- CPU fallback — технический безопасный маршрут, метрика `cpuFallbackCount`, **не способ обойти credits**. Если он обещает safe и не может доказать, пометить `UNKNOWN`, выбрать документированный deterministic fallback и не объявлять solve guarantee.
- История необработанных/неудачных выдач и история opener/result — разные поля. Использовать bounded history; она должна мигрировать и сохраняться при resume.

### 4.3. Отчёт о сравнении

Подтвердить снижение `help_applied_per_100_deals` и сокращение неразумно длинного хвоста для слабого/среднего бота **без** существенного ухудшения первых партий, доли честных задач и наград. Точные пороги acceptance определить **до нового holdout** из существующего control — не из отраслевых «норм» или раскрытого holdout D91. Полные и обычные очистки считать раздельно. Ходы до capped моделирования — `CENSORED`, не поражения.

## 5. Ритм и виды содержательных задач

Предлагаемые фазы (не слепая копия иностранной модели):

| Фаза | Смысл | Признаки задачи | Негативный контракт |
| --- | --- | --- | --- |
| `WARM` | первые решения, ясный успех | witness на всю тройку; хотя бы одна доступная линия | не скрытый безвыходный opener |
| `REWARD` | видимая заслуженная разрядка | player-created clear, возможность довести подготовленное | не выдавать all-clear автоматически на каждой раздаче |
| `CHALLENGE` | выбор и последовательность | `CHAIN` / `CHOICE` с проверенным продолжением | не считать каждую individually placeable фигуру решаемой тройкой |
| `PRESSURE` | управление пространством | после каждого разумного хода меньше удобных безопасных продолжений | не добавлять намеренный безвыходный лоток под видом hard |
| `NEAR_RECORD` | близость личного ориентира | доступная достижимая цель; контролируемая награда | не подменять победу/поражение ценой рекламы |
| `POST_REVIVE` | короткое восстановление контроля | доказанный целый лоток; затем шанс действия | защита конечна, не открывает бесконечную easy-петлю |

Фаза должна зависеть от **заполненности, характера последних решений, успешности доступных планов, истории и активного времени**, а не только от `score` или размера фигур. Введите hysteresis (например, два завершённых лотка до повторного перехода) и cooldown после наград. Доступность и skill оценивать по доказуемым игровым признакам, не по FPS устройства, отключённому экрану, рекламе или долготе сохранения.

**Измерение темпа:** последние N=8 завершённых лотков по active foreground play time, без fullscreen ads, pause, background и blocked input. N — proposal; у конкурента проверено иное окно (10 интервалов между clearProducer). Не ускорять сложность только потому, что игрок быстро делает drag. Смена starter recipe меняет длительность первой раздачи, это не характеристика человека.

### CHAIN — последовательная задача

Подходящий лоток имеет witness на все три фигуры, но для получения полезного размещения второй фигуры сначала нужно выполнить конкретный подготовительный ход и/или очистить линию. Вычислять: `existsSolvableSequence`, `requiresPriorClear`, `countGoodFirstMoves`, `postSolutionFreeCells`. Не называть сложно просто из-за большой площади фигуры. Фикстуры, в которых первая фигура не помещается, но все три можно разместить в правильном порядке, — обязательные.

### CHOICE — выбор с последствиями

Две и более допустимых первые постановки; только часть сохраняет полное продолжение. По bounded DFS считать `legalFirstMoveCount`, `solvingFirstMoveCount`, `badButLegalFirstMoveCount`, `solverStatus`. Если solver=UNKNOWN, не маркировать результат как проверенный trap. `countLeaves` — не оценка человеческой вероятности победы; не считать случайные ходы репрезентативными людьми.

### PRESSURE — не путать сложность и бессмысленную смерть

Нужны кандидатные раздачи, где поле реально становится более тесным, но имеет осмысленный план. Измерять медиану свободных клеток после *разумного* полного решения, число вариантов открытия линии и чувствительность к первым ходам. Игрок должен видеть связь с собственной постановкой. Нельзя менять фигуры только потому, что готова дорогая реклама. Дожимать хвост автоматически после фиксированного числа ходов запрещено.

### Разнообразие старта

Сохранить D91: 8 семей/32 поворота, anti-repeat и проверенные пути; дополнительно учитывать эквивалентность по симметриям и идентичность первого *решения*, а не только openerId. Варьировать заполнение и форму свободного пространства, размер/порядок лотка, один/два подготовительных хода, альтернативные opener. Постановочный all-clear допустим редко как FTUE/специальный эпизод с явным budget, но **не каждый старт**. `resume` не заменять новым стартом.

## 6. Whole-hand validator и генератор после всех замен

### Контракт

`SOLVABLE` — есть конкретный witness, использующий все фигуры в любом разрешённом порядке и реальные одновременные line clears. `UNSOLVABLE` — полный допустимый перебор доказал отсутствие. `UNKNOWN_TIMEOUT` / `UNKNOWN_PRUNED` — установлен предел и отсутствие доказательства. `safe` обещает только явно описанную степень: можно поставить **одну** фигуру, существует план **всей тройки**, или существует несколько хороших продолжений. Это разные гарантии.

**Непосредственно перед публикацией final tray** (после feature flags, генератора, fallback, post-processing, revive guard) проверить соблюдение выбранного promise, особенно на первых двух раздачах и revive. Не выдавать `hasOneLegalPlacement` за `wholeHandSolvable`. При допустимом budget exhaustion сохранить неизвестность, идти по документированному safe fallback; если нет безопасного результата, не публиковать ложно обещанный «solvable» лоток.

**Независимая геометрия:** сверить ID/повороты с фактическими фигурами на экране, особенно асимметричными, через реальный `applyMove`. Не пересоздавать прежнюю ошибку зеркальной таблицы.

### Минимальный алгоритм в приложенном оригинальном примере

`reference/clean-room-policies.ts` содержит собственный exhaustive DFS для 8×8 (как **эталон тестов**, а не новый продакшн-генератор). Он ставит фигуру на все допустимые позиции, очищает заполненные строки и столбцы *одновременно*, перебирает порядок оставшихся фигур и возвращает `SOLVABLE` с witness, `UNSOLVABLE` только после полного обхода, либо `UNKNOWN_TIMEOUT` при лимите посещённых узлов.

Его нельзя автоматически подключать к Phaser или вызывать синхронно на каждом жесте; сначала сравнить с существующим domain solver, затем интегрировать только отсутствующие контракты в текущий worker. `node:test` в приложенном пакете проверяет базовые границы, включая отсутствие ложного `UNSOLVABLE` на timeout.

## 7. Revive как честная и конечная ценность rewarded

Сохранить D87: зона освобождения выбирается после доказательства разрешимости **остатка** текущей тройки; выбранный вариант freeze **до** рекламного предложения. Не пересчитывать уже приготовленное предложение из-за нового config. Транзакция поздней награды использует `gameId/revision/intentId`, исходный архив и idempotent receipts; callback после новой партии не заменяет активную.

В `reviveWindowV1` отдельно тестировать **1** и **2** последующие раздачи с реальным short witness. Защита заканчивается, не пополняет run help, не создаёт собственную переменную подписку на «бесплатные вечные жизни». В обычных правилах preserve одна revive возможность/партия и фактические лимиты из D87, пока owner не утвердил иначе.

Сценарии: earned reward затем app background/kill → восстановить право; repeated onRewarded → одна награда; onFailedToShow/no-fill/close без earned → не выдавать; earned приходит после closed → учесть независимо от порядка; новой партии offer не переносит автоматически. Технически недоступная реклама и платное entitlement могут дать отдельную **явно бесплатную** ветку только по принятому product rule; не выдавать за paid impression.

Метрики: `revive_offer`, `revive_accept`, `ad_request`, `rewarded_impression`, `reward_earned`, `revive_claimed`, `revive_protected_deals`, `post_revive_playable_moves`, `return_after_revive`. Разделять физический рекламный callback и локальный synthetic continuation.

## 8. Реклама: отдельная политика eligibility, load, impression, reward и revenue

Yandex Mobile Ads Android документация (проверена 15.11.2026): [rewarded](https://ads.yandex.com/helpcenter/en/dev/android/rewarded), [interstitial](https://ads.yandex.com/helpcenter/en/dev/android/interstitial). Реальные SDK callbacks `onAdShown`, `onAdImpression`, `onAdDismissed`, `onAdFailedToShow`, `onRewarded` отражают **разные события**; интервал callback/revenue не фиксировать единственным порядком. Вызовы SDK — с main thread нативного Android; сохранять loader/ad references на активный экран, снимать listeners при cleanup, не устраивать бесконечных retry на no-fill. У приложения свой адаптер из D19/D87 — развивать его, не заменять SDK.

### 8.1. Непересматриваемые hard gates (порядок)

1. `paidNoAds / disabledByOwner / unsupportedBuild / demoPolicy` — договорённости и запреты. Проданный `remove ads` не отменять коммерческой heuristics. Если право распространяется только на interstitial/banner, rewarded остаётся добровольным строго по его продуктовому смыслу.
2. Не показывать fullscreen на gesture, в середине активного хода, между выбором позиции и сохранением, поверх незавершённого reward claim/платного эффекта, tutorial/FTUE. Return from ad должен восстановить управление.
3. One fullscreen placement lock per foreground; повторные callbacks/load не создают второй запрос и дополнительное право.
4. Учитывать actual `ready` и network/SDK state; `ALLOW` не равен `SHOW`, `IMPRESSION` или `REVENUE`.
5. Дневные/сессионные квоты и cooldown — только если их момент расходования явно определён в config.

### 8.2. Soft shields (кандидаты)

| Shield | Условие предложения | Поведение |
| --- | --- | --- |
| first-session protection | первый игровой заход и короткое обучение | скрыть принудительную interstitial |
| bad-game relief | короткая неудачная партия без существенной награды | пропустить следующую opportunity на ограниченный TTL |
| failed-rewarded relief | ad no-fill/failed show после пользовательской попытки | не давать сразу interstitial |
| return-player relief | длительное отсутствие + первый foreground | пропустить первую natural opportunity, не вечная защита |
| post-earned-reward gap | подтверждённый rewarded | cooldown перед принудительной рекламой |
| new-record celebration | финальный результат с новым личным достижением | сначала дать закончиться награде и показать результат |

**Стартовые experimental numbers, не нормы рынка:** `minActiveSessionsBeforeInterstitial=1`, `minCompletedGames=2`, `minInterstitialGapActiveMs=240_000`, `afterRewardedGapActiveMs=600_000`, `maxInterstitialRequestsPerSession=2`, `maxConfirmedImpressionsPerDay=4`, `badGameSkipOpportunities=1`, `returnSkipOpportunities=1`. Не включать как новые значения control: сравнить с реальными D87 caps, выбрать только отличающуюся opt-in ветку. Дневная дата — device local/canonical wall day с rollback-тестами; cooldown по активному времени, не просто uptime процесса.

**Re-shield конкурента** доказывает, что позднее правило может отменить ранее выданную защиту. В нашей системе _не_ разрешаем позднему коммерческому soft-override отменять hard gates, платный entitlement или пользовательское opt-in rewarded. Если нужен явный дополнительный показ, он может отменять **только перечисленный soft shield** с reason/priority и с собственным конечным бюджетом. По умолчанию override OFF. Отдельно решить момент расхода request cap и confirmed impression cap: не смешивать их.

### 8.3. Event contract

`ad_opportunity` (без SDK), `ad_policy_evaluated` (ALLOW/SKIP+reason), `ad_load_request`, `ad_loaded|ad_load_failed`, `ad_show_request`, `ad_shown`, `ad_impression`, `ad_show_failed`, `ad_closed`, `reward_earned`, `ad_revenue_paid`, `free_continuation`, `revive_applied`. У каждого `opportunityId`, `showAttemptId`, `placement`, `configVersion`, `sessionId`, `gameId`, timestamp + source. `ad_impression` и `ad_revenue_paid` только по достоверному SDK событию; dedup по ключу, повторное событие не прибавляет деньги/награду. Revenue хранить в точных единицах SDK (amount/currency/precision), без догадок о тысячных и без искусственного присвоения нуля отсутствующему callback.

Native→JS может прислать paid event до close/после close/reward. Ledger принимает всё как независимые записи, потом связывает по `showAttemptId`/ad-specific key. Не суммировать автоматическую AppMetrica копию и свою ILRD запись: D87 schema2 принимает канонический `source=blocky_ilrd_v1`. Пока AppMetrica preview OFF, проверять локальный событийный trace и demo callbacks; деньги считать UNKNOWN/TEST, не выручкой.

### 8.4. Оценка денег

Основной показатель реального эксперимента — **суммарная фактически подтверждённая рекламная выручка на рандомизированного назначенного пользователя за одинаковое окно D7/D14**, включая ушедших и нулевых; отдельно доля с неизвестной выручкой. Дополнительно D1/D7 retention, return-after-loss, rate второго запуска, opt-in rewarded funnel, уход после interstitial, impression/request rate, eCPM/fill, active time, crash/ANR и complaints. Не выбирать post-hoc только зрителей рекламы. Никаких заявлений о росте денег от одного бота.

## 9. Подробный каталог конкурентных правил как **референс**

Ниже **самостоятельно сформулированные эквивалентные проверки** наблюдаемого поведения, не украденные функции. Каталожные значения — факты конкретных сборок/arm, **не настройки Blocky**. Источник и версия обязательны в tests/notes.

| Источник | Проверенные условия / нюанс | Что нам полезно |
| --- | --- | --- |
| **Android external Harvest** | последние 3 rewarded завершились успешно; `readyValue >= 3.5 * previousRewardedValue`; score достигает `startHighScore + step*(triggerCount+1)`; pending и session scope; declared `minGameDurationSeconds=420` **не участвует в firing gate** | учёт source/units/score snapshots/attempt count; NOT для ad→loss policy |
| **iOS Harvest V2** | raw `installDay` сегменты `<7`, `7..30`, `>=31`; numeric thresholds 3.2/2.7/3 с epsilon; первым двум нужна положительная cache-history; база может переживать партию; successful completion требуется не во всех arms | event provenance и reset scopes; реальные денежные единицы остаются UNKNOWN |
| **iOS PersonalMarginBreak** | recorded `prob=20` применяется при **каждом** подходящем hook; event new-record и `score >= startHighScore*(1+0.10)`; при отказе алгоритма fallback chain | не путать per-call probability с per-session; тщательно логировать итог |
| **Android Record Support v4** | historical `highScore > 20_000`, random `<0.75`, до 2 выбранных партий/день и не соседние; до `floor(0.8*startHighScore)` подавляет часть задач; при рекорде запрашивает death family | конечное окно помощи, cooldown и caps; terminal copy запрещён |
| **ComboHelp** | помощь на разрыве серии и истории плотности; расход по **actual selected family**; budget при `++newGameCount>N`, т.е. для N=3 на 4-й новой партии | неперекрывающийся учёт помощи и строгие сравнения |
| **LowClear model** | ответы типа p/time/c/t и daily quota all-clears; серверные коэффициенты неизвестны | отделить remote response от локального результата, не выдумывать params |
| **Timed hard / fast** | окно сложности и 10 интервалов между completed trays; среднее <=4600ms в одном варианте сдвигает timing; background исключён | активное время и debounce выбора фазы |
| **SDK last-mile guard** | целая тройка проверяется на round1/2 либо revive; после неудачи пытается замену; round0 автоматически не защищён | проверки promise в конце pipeline; не считать обработчик гарантией для любого поля |
| **Ads shield/re-shield** | обработчики применяются по порядку, позднее override может снять мягкую защиту, quota расходуется до impression | независимые request/impression budgets и precedence |
| **1010! ARM gates** | wall install age и cooldowns после interstitial/rewarded; отдельно score+resume elapsed; equality often fails due strict `>` | разные временные базы, noads, paid, resume и события |
| **Board catalogs** | 2000/60 стартов, история, анти-повторение и scripted first-day all-clear | разнообразие имеющихся 8 рецептов, а не тупое создание 2000 новых |
| **Device timeout** | после медленного алгоритма могут идти safe alternatives; blacklist имеет reset scope | технические фолбэки учитывать отдельно и не превращать в тайную помощь |

**Ограничение:** наличие локального тела не доказывает live assignment, происхождение числа adValue не доказывает его денежную единицу, и death-family request не доказывает итоговый проигрыш после fallback. Полный инвентарь original bodies см. по ссылкам в §13.

### 9.1. Реконструкция условий как учебные примеры (НЕ код конкурента)

```ts
// REFERENCE-ONLY: логическая формулировка исследованного Android Harvest.
const harvestRequestObserved =
  rewardHistory.slice(-3).length === 3 &&
  rewardHistory.slice(-3).every((entry) => entry.earned) &&
  readyAdValue != null && previousRewardedValue != null &&
  readyAdValue >= 3.5 * previousRewardedValue &&
  score >= startHighScore + scoreDeltaStep * (triggerCount + 1) &&
  !requestPending;
// Нельзя вызывать gameOver() или изменять выдачу в Blocky по этому условию.
// Поле minGameDurationSeconds в проверенном оригинальном firing gate НЕ использовано.

// REFERENCE-ONLY: observed iOS PersonalMargin (пример recorded props, не default).
const recordBreakAttemptObserved =
  trainingCompleted && !firstGame && !reviveActive && recordEvent &&
  score >= startHighScore * 1.10 &&
  randomDraw100 < 20;
// RNG draw happens per qualifying hook; не считать 20% партий.
```

## 10. Чистая архитектура взаимодействий и порядок приоритета

```
GameSession/GameRecord + stable config/RNG
          |
          v
Existing Director -> CandidateGenerator -> CandidateValidator
          |                |             |
          |                +-- CPU fallback / source reasons
          +-- Phase + assistance budget
          v
Post-process / FinalValidation / FinalDecisionTrace
          v
ATOMIC SAVE -----> renderer + sound + input unlocked
          |
          +-- GameOver/ReviveOpportunity --[separate AdPolicy]---> SDK adapter
                                                        |
                                                callback/ILRD ledger
                                                        |
                                             idempotent reward/continue
```

**Запрещён обратный путь:** SDK adValue/adReady/eCPM/placement → выбор фигур/намеренный terminal. Рекламная политика может читать `gameOver`, `activeSession`, history, возвращение и добровольный пользовательский intent, но не менять исход уже поставленной фигуры или скрытно перестраивать текущий лоток.

Сохранение — источник истины: game state/reward intent/receipt и решение commit одним транзакционным методом. Новое решение применяется только к `gameId` и `revision`, при отмене worker stale result отбрасывается. При crash после commit и до эффектов корректно восстановить запись и не выдавать повторный score, hint или rewarded.

## 11. Проверки и тест-план (каждый с входом, ожидаемым результатом, evidence)

### 11.1. Solver / геометрия

- Гарантированная целая тройка, где у одной фигуры нет первого размещения, но появляется после очистки другой. Есть конкретный witness. Проверить все 6 порядков, где применимо.
- Две альтернативы первого хода, одна оставляет полный маршрут, другая нет. Отличить `legal` от `good`.
- Неразрешимая доказанная тройка, отсутствие хода, независимый второй solver и асимметричные фигуры; сериализованная R-форма не использовать.
- Tiny budget возвращает `UNKNOWN_TIMEOUT`, **не** `UNSOLVABLE`.
- После каждого override/fallback итоговый promise проверяется снова.
- CPU timeout не делает вечную цепочку easy выдач и имеет собственную причину.

### 11.2. Assistance / phase / board

- При чередовании opener/recovery/combo/late общий бюджет убывает и конечен; rejected candidate не расходует; actual applied family расходует даже при другом инициаторе.
- Два подряд full clears, resume, save/load, new day, новый рекорд, неудачный rewarded **не пополняют** run budget.
- New game даёт новые квоты; revive только отдельное конечное protection; reset scopes проверены после kill/restart.
- Кандидат CHAIN подтверждён witness; CHOICE имеет и хорошие и плохие легальные первые ходы; PRESSURE не становится заведомо терминальным без выбранного эксперимента.
- Opening anti-repeat учитывает вращение и одинаковые первые решения; scripted clear не доминирует.
- Active time исключает background, loading, рекламу, сохранение и pause; fps/slow device не засчитывается как низкий skill.

### 11.3. Revive / Ad SDK / persistence

- Reward callback раньше close и позже close; duplicate, fail, no-fill, cancel, background, low memory, process death; одна награда/intent.
- Late earned reward направлен в исходный archived game, не вмешивается в текущую новую партию.
- Entitlement/no-ads всегда выше reShield; soft relief после плохой партии или failed rewarded имеет конечный TTL и явный расход.
- Allow→no-load; load→fail-show; show→close без impression; impression→revenue позже. События не подменяют друг друга, request и confirmed quotas не конфликтуют.
- Смена календарного дня, timezone, clock rollback, offline, network unavailable; каппы не обходятся by resume/new process.
- SDK вызывается в native main thread, listener cleanup/strong references/retry проверены Android-emulator и физическим устройством. Demo не доказывает paid delivery.

### 11.4. Performance / human

- Сравнить stage timing принятого хода до durable commit и до следующего доступного ввода. Исходный 0.66 performance фикс не откатывать; не наращивать фоновые worker-поиски на пальце.
- Идентичные 457 human replay и новые тестовые записи воспроизводятся; старые savestate/raw private files остаются вне Git.
- Три игрока: bounded/случайный допустимый, greedy clear, planning short horizon. Выводы из ботов не приравнивать к retention или субъективному удовольствию.
- Real player проба минимум три характерные партии (ранний проигрыш, средний напряжённый эпизод, длинный tail) с одинаковой сборкой/условиями и раздельными feedback-заметками. При необходимости собирать реальные device frame pacing и lag — не делать вывод из desktop RAF.

## 12. Стадии реализации и строгие выходы

| Этап | Разработка | Что сдавать | Gate |
| --- | --- | --- | --- |
| P0-A | Аудит active branch и реальной цепочки | `CURRENT_STATE_AUDIT`, таблица фактических help sources, config/control | без regressions и повторной реализации D91/D87 |
| P0-B | Финальный decision trace + replay | сериализация, deterministic fixture, replay-index | те же final IDs, reason и budgets после всех transforms |
| P1-A | Общий budget помощи | один минимальный кандидат, documented caps, migration и off | нет бесконечной смены помощников; корректны early/late |
| P1-B | Подтверждённый challenge mix и открывающие поля | реальные CHAIN/CHOICE, reward/pressure, anti-repeat | playability, человеческая осмысленность; reject при наградных провалах |
| P1-C | Окно revive | 0/1/2 защищённых лотка отдельно | finite window, whole-hand witness, журнал прав |
| P2-A | Ad precedence, relief, ledger | одна отдельная экспериментальная конфигурация и отчёт callbacks | no duplicate reward/revenue, no false impression, hard gates intact |
| P2-B | Воронка и деньги | события, schema, тестовый отчёт, план D7/D14 | никаких revenue claims на demo / AppMetrica OFF |
| P3 | Rollout | stable flags, отдельные arms, stop-rule | owner/human/physical gate, baseline retention/revenue |

### Acceptance report (обязательный)

1. База: точная ветка/SHA, актуальные AGENTS и реализованные D87–D92; что повторно не делалось.
2. Таблица `было → стало → обоснование → флаг → числовая конфигурация → тест`.
3. По одному воспроизводимому эпизоду: `CHAIN`, `CHOICE`, ограниченная помощь, разный opener, post-revive, SDK failure/return.
4. Матched simulation: distributions time-to-first-loss, обычные/full clears, помощь по источникам, strong-vs-weak advantage, early deaths, censored tails, p95 compute cost. Раскрытые dev seed и отдельный untouched holdout.
5. Code/diff/tests: TypeScript, browser, Android emulator/native, физический Android, human. Не ставить PASS там, где устройства/кабинета нет.
6. Платформенные события: ad attempts, impressions, earned reward и paid revenue отдельно; demo/off не называем живой монетизацией.
7. Rollout: default/flags, HOLD/REJECT/ACCEPT, rollback, kit feedback NONE/REUSE/IMPROVE/CANDIDATE/EXTRACTED.

## 13. Регистры источников (выполненная работа, новые факты не выдумывать)

- Основной [Blocky D92/source](https://github.com/DanilaH/blocky-block-puzzle/tree/fix/floating-ownership-20261115): `AGENTS.md`, `docs/DECISIONS.md`, `docs/SESSION_HANDOFF.md`, D91/D92 QA.
- [Blocky pass4 итог](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/BLOCK_PUZZLE_PASS4_CLOSURE.txt) + [дополнение к заданию](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/BLOCKY_AGENT_ADDENDUM_PASS4.txt).
- [Геометрическая поправка](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/pass4/board/RECOVERY_CORRECTION.md), [SDK output/final validator](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/pass4/generators/NOTES.md).
- [Ads/priority](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/pass4/ads/NOTES.md), [rhythm/help](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/pass4/rhythm/NOTES.md), [Android external Harvest](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/pass4/external/NOTES.md), [1010 ARM](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-reverse-engineering/pass4/tenten/NOTES.md).
- [iOS Harvest V2/PersonalMarginBreak](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-ios-commercial-rules/README.md), [дельта Blocky](https://github.com/DanilaH/mini-games-kit/blob/main/research/games/block-puzzles/2026-11-15-ios-commercial-rules/BLOCKY_RESEARCH_DELTA.md).
- [Официальный Android Yandex rewarded](https://ads.yandex.com/helpcenter/en/dev/android/rewarded) / [interstitial](https://ads.yandex.com/helpcenter/en/dev/android/interstitial); не подставлять текущий SDK 8 в уже pinned native build без отдельного обновления.

## 14. Что НЕ включено этим ТЗ

- Режим Adventure/PvP, сезонный магазин, косметика/метавалюта, новая серверная модель игрока, ML/UCB personalization, агрессивные рекламные каскады, покупка показов, подмена отзывов.
- Auto-termination по времени/score и связь eCPM→нерешаемая выдача — исследованные у конкурента механизмы, сознательно **не переносимые в Blocky** по действующим решениям.
- Прямое копирование защищённых декомпилированных тел, UI-картинок, музыки, брендовых названий; код в reference — чистая самостоятельная реализация.

**Итоговый критерий:** один технически объяснимый директор на существующем core, конечная помощь, реальные тактические задачи, честный полезный revive, управляемая реклама с раздельной достоверной аналитикой и доказанный rollback; каждый коммерческий эксперимент измерим, а не объявлен оптимальным по конкурирующему SDK.
