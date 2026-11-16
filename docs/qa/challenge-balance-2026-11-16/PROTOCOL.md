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

До нового development заморозить один алгоритм/конфигурацию. Reserve: dev8107001…8107016, holdout8108001…8108016, по4 игрока и4 фактора=256 запусков на stage, cap300, no revive. Прежние процентные gates D95 без ослабления: task-rate +max(1pp,20%), ≥1 новый matchedCHAIN иCHOICE; ordinary≥85%, clear/three/lapse reward-rate≥75%, clear/lapse capped mean≤110%, p95≤1.25×control+2ms, work≤24000. На16 партий допускается≤2 дополнительных early deaths и≤2 потерянных bounded reward-games; fallback≤2×control+2. Эти пределы — масштабирование старых guards на удвоенный N, не рыночные нормы. Все факторы/неуспехи раскрыть, hidden holdout только после полного devPASS, без выбора лучшего варианта по нему.

Добавленные hard checks: rejected target leaves actual baseline hand/RNG/controller/witness intact; все128 R3 seen runs и старые captures повторяются без переинтерпретации; нет изменения0.70 policy/config, saved receipts/rights/recovery и запись времени проходит worker/JSON/replay. Если нового положительного результата нет — HOLD, не объявлять задачу решённой за счёт изменения gates.
