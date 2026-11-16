# D96: причинный разбор наград и хвоста после0.70

База7c80782290408dc7e81e2da8f9f5cde7ade54fa2; APK0.70 sourcea9b03f3/tree0454cd2 остаётся замороженной. Старый director-challenge-v1/configR3 и все установленные saves/rights/replays сохраняются. Ветка work/challenge-balance-20261116, не main.

Текущий запрос: продолжить собственную доработку баланса параллельно телефонной пробе0.70. Не начинать revive-window/ad-cadence, не включать аудиторию, не складывать сbudget-v1. AppMetricaOFF/demo ads. Работы толькоBlocky, оригиналы владельца не публиковать.

Guidance mini-games-kit e528149748a46bbdc04789f13b44f3aa3856300f; runtime pin5450f9d прежний. SELECT core-challenge + content-quality, experimentation как проверка доказательств. KIT IMPACT NONE: проверяется политика конкретной игры, не общий director/SDK.

## Сначала причинная диагностика, без нового кандидата

Данные8105xxx уже видны и используются только как engineering. Holdout8103xxx по-прежнему закрыт. Факт: R3 full прошёл development guards, tasks-only clear reward rate4.58% противcontrol7.50%, lapse mean137 против105.88; общий gateFAIL.

Проверяем две гипотезы: (A) попытки нового поиска меняют реальный hand ещё до получения подтверждённого CHAIN/CHOICE; (B) реальная цена новых решений или цена исходного бота. Для каждого refill на том же board/seed/controller сравнить actual final hand/RNG/goal с настоящим v2, не с внутренним incumbent. Отдельно считать witnessed lines/full clears и фактическую игру. Фиксировать первую разницу каждой парной траектории. UNKNOWN не отрицательное доказательство.

Контрфактическая диагностическая абляция: если окно R3 не выбрало задачу (selected=false), подставить фактический результат v2 через настоящий applyMove на том же pre-move состоянии; phase clock/history оставить от R3. Это исследовательская операция для локализации причины, НЕ production-policy и НЕ доказательство удовольствия. Исходные seen-seed конечные hashes обязаны точно воспроизвестись.

Raw synthetic contexts/trajectories толькоignored artifacts; публично агрегаты иseed/hash recipes. Оригинальные1120 пользовательских ходов — отдельный private regression, не новое обучение модели.

## Граница следующей реализации

Только если причина подтверждена: один новый director-challenge-v2, без переопределения0.70. При неподтверждённой/ухудшающей замене сохранять фактический v2 hand/RNG/controller. Использовать существующий поиск и общий limit24000, не второй глобальный engine. Принятая замена имеет полный witness, подтверждённый task и сохраняет наградную возможность/обычные линии baseline; CPU miss не превращается в helper/смерть. Ранние12/rest/recovery3 прежние, фазовые числа не подбирать по провалу.

До нового development заморозить один алгоритм/конфигурацию. Reserve case IDs: dev8107001…8107016, holdout8108001…8108016, по4 игрока и4 фактора=256 запусков на stage, cap300, no revive. Actual gameplay seeds определяются заранее outcome-independent scripts/challenge-content/seed-plan.mjs: avalanche mix caseID, затем xorshift до заданного openingId/rotation. Все8 семей по2 seeds; dev rotation0/1, holdout2/3. Это стратификация известного исходного контента, не отбор по проигрышам/наградам. Все arms используют одинаковые actual seeds; RNG игрока независим. Причина: старые adjacent R3 seeds8105001…08 покрывали только opening6 (7×rotation0,1×rotation1),R1 — толькоopening7. Старые результаты не переписываются и не повышаются до общих выводов.

Прежние процентные gates D95 без ослабления: task-rate +max(1pp,20%), ≥1 новый matchedCHAIN иCHOICE; ordinary≥85%, clear/three/lapse reward-rate≥75%, clear/lapse capped mean≤110%, p95≤1.25×control+2ms, work≤24000. На16 партий допускается≤2 дополнительных early deaths и≤2 потерянных bounded reward-games; fallback≤2×control+2. Эти пределы — масштабирование старых guards на удвоенный N, не рыночные нормы. Все факторы/неуспехи раскрыть, hidden holdout только после полного devPASS, без выбора лучшего варианта по нему.

Добавленные hard checks: rejected target leaves actual baseline hand/RNG/controller/witness intact; все128 R3 seen runs и старые captures повторяются без переинтерпретации; нет изменения0.70 policy/config, saved receipts/rights/recovery и запись времени проходит worker/JSON/replay. Если нового положительного результата нет — HOLD, не объявлять задачу решённой за счёт изменения gates.

## Freeze одного нового отбора перед dev

director-challenge-v2/config challenge-content-v2, отдельное authoritative challengeV2State. Окна/таймер/авторские старты переиспользованы изR3 через прежний wrapper; старая политика по умолчанию вызывает тот же generator. Новый wrapper подставляет verifiedGoalDeal. До baseline incumbent новый selector не меняет ни ranking/dedup/parents, ни RNG. Он наблюдает только уже раскрытые complete nodes и хранит≤64 разных hands.

После полного обычногоv2 (включая его certificate/alternative) можно один раз продолжить тот же beam:≤6000 оставшегося work с резервом5000 на proof, старые allow/scoring и bounded diverse retention. В exact-reward ветке —≤6000 оставшегося work на тот же finishGoal и≤2 placement proofs по1800 внутри этого allowance. Общий limit24000/резерв512 прежний; новый поиск не сдвигает gameplay RNG. Неизвестность и miss оставляют literal baseline tray/witness/controller/source/certificate. Если baseline уже CHAIN/placementCHOICE, он сохраняется.

Новая замена требует подтверждённого CHAIN или complete placementCHOICE, иного hand, lines≥baseline и full-clear-count==baseline (не меньше и НЕ больше). Для beam дополнительно old goal value≥baseline−80; до4 разных hands делят≤5000 proof checks. В trace initial IDs — именно final control IDs, не speculative incumbent. before/after work, admission reason, protected/miss/quality/unknown и actual task раздельны. Дополнительный solver allowance0 — диагностический literal-control путь.

Engineering на прежних80 baseline полях: новая chain появилась в1 matchedполе, choice в1; ни одного изменения безselected, потери baseline линий/подарка или сдвигаRNG/controller. Это проверка механизма, не результат dev/holdout. Все381 unit/build проходят, включая воспроизведённый shipped miss, tiny refinement budget, оба положительных proofs, anti-gift, оба clocks/worker cancel, new save/replay иearned recovery3. Перед dev записать точный source freeze SHA; после него никакого retuning по этому набору. Dev запускать без параллельных CPU/GPU тестов, чтобы stage timing был интерпретируемым.
