# D94 P0: действующий путь и минимальная дельта

Base5390af7/publicdc26d27,source0.67=86daf152/tree1e32e331;0.67 CI43815781553
полностью success. Node24.22/TS5.9,Phaser4.2,Capacitor8.5,Android36.
Runtime kit5450f9d,research-guidance ca427723;не обновлять vendor runtime.
Исходное TZ сохранено в docs/tasks;ссылки на pass4/correction/iOS прочитаны.

|Требование|Что фактически есть|Дельта этого прохода|
|---|---|---|
|Stable policy|GameState.dealerVersion,goalDirector.version2,manual experiment,rolloutOFF|новая отдельная версия,старые не переопределять|
|Цепочка выдачи|rules.newGame/deal/applyMove → goalDirectorDeal → optional composition → store → effects|trace **финального** результата,без второго generator|
|Whole hand|constructive3-move path,proveIds(found/unknown/unsolvable),simultaneous clears|переиспользовать,не переписывать solver|
|Decision metadata|G возвращает requested/actual/source/checks/certificate;v2 GameState их не хранит,composition сохраняет только короткий reason|opt-in trace в существующем PlayCapture move/checkpoint,не в каждом save/analytics|
|Atomic accepted move|MoveCalculator worker → ProfileStore.update atomic → capture/effects|trace публиковать только после успешного save;stale/cancel не сохранять|
|Revive|frozen3x3 selection,unknown отдельный результат,receipts,intents;recoveryDeals=3|без изменений окна/награды/earned прав и рекламы|
|Start|composition-v2:8 recipes/32 rotations/anti-repeat;defaultv2 прежний|сохранить;новый budget кандидат сравнивать с v2 без смены старта|
|Money|native ILRD/schema2,R7,offer/earned/continued/skip reasons|не реализовывать повторно;ad caps в этом проходе не менять|

## Реально действующая помощь,не перечень всех старых flow traits

|Источник|Trigger/приоритет|Расход/сброс сейчас|Итог|
|---|---|---|---|
|ранняя подготовка|moves<12,если нет recovery/rest/payoff|конечный early threshold;beam size≤6|сохранить ранний контроль|
|rest после all-clear|observeGoalDirector ставит rest1/payoff0|следующая rest снимает1;каждый all-clear снова включает|может повторяться без общего run cap|
|payoff|prepare ставит1,load ставит2|payoff убывает;каждая prepare/load снова пополняет|главная возобновляемая помощь|
|relief|occupied≥40 или dryMoves≥6,после payoff/rest|нет общего cap/cooldown;снова допустима при сохранённом условии|дополнительная возобновляемая помощь|
|exact-clear|payoff/relief/recovery,поле непустое|до6000 work на finishGoal,затем support beam|path использует реально выбранный результат|
|reward bias подготовки|clear weight2500,lines180;support8000/500,target0|действует в каждом соответствующем beam|обычный search тоже может случайно дать all-clear|
|load|sinceLoad≥3 и доступна крупная форма|сбрасывает sinceLoad,пополняет payoff2|осмысленная нагрузка,не auto-loss|
|post-revive|recoveryDeals3 после earned/claimed|минус1 только при следующем refill;remaining tray отдельно|обязательный защищённый контракт,не discretionary credit|
|technical fallback|не найден целый path в work budget|3×S1 с witness;dealerFallbacks|виден отдельно,не считать поисковую неудачу помощью/смертью|
|flow pressure/encore|поля RhythmState ещё существуют|v2 не читает часть старых flow traits|не объявлять все исторические helpers активными|
|composition-v2 late|moves≥72 вне recovery|payoff2→1 и equal-area lineAllowance1|HOLD independent baseline,не основа нового budget arm|

Baseline64 games/4styles/8новыхseeds/cap300 в comparison-summary.json. Сильный three:
v2 все8 censored,393 all-clears/2400moves;composition-v2 тоже8 censored,105.
Clear:v2 2 censored,115 all-clears;composition-v2 0,19. Bounded у v2 ранние
поражения14/29 и др.,поэтому нельзя просто резко снять поддержку со старта.
Исходные записи владельца восстановлены из личных файлов в private-inputs,
в Git не включаются. Их ходы будут перепроверены до/после core изменений.

## Выбранная минимальная реализация

1. Opt-in DecisionTrace через дополнительный аргумент pure move/worker,
   сохранение в существующие события PlayCapture только после durable commit.
   Старый GameState/hash/RNG/control остаются побайтно прежними (A/A).
2. Один director-budget-v1 на том же goal generator:общий конечный discretionary
   budget,холодный интервал между реально выбранными улучшениями,без ad inputs.
   Обычная целая конструктивная тройка никогда не требует платного help credit.
3. Preserved early segment и все3 recovery,старые save/receipts. Новая политика
   только для новых выбранных партий,defaultv2/rolloutOFF;не reassign на resume.
4. Сравнить ordinary vs extra-help incumbent в общем≤24000work,расход только
   при отличающемся финальном лотке с подтверждённой дополнительной линией
   или all-clear в witness. Отклонённый help не расходует credit/selected RNG.
5. Один замороженный config после baseline;dev/holdout и независимый replay.

Новые6фаз/стартовыйбанк/revive0–2/ad cadence из полного TZ остаются следующим
этапом. Kit impact NONE:это игровая политика Blocky;kit/его reports не менять.
