# D97: покрытие поиска до следующего кандидата

База d007815, APK0.71/source5be1d7b и политики0.70/0.71 заморожены. Ветка work/challenge-opportunity-20261116, не main. Запрос владельца: продолжить собственную доработку редкого срабатывания задач, пока обязательный плейтест не нужен. Никаких рекламных, revive, визуальных и ML изменений. Defaultv2/rolloutOFF, demo ads/analyticsOFF. Только Blocky; original captures и raw synthetic вне Git.

Guidance33515a3d6dced434cb518e1c488c9ef86be42ce7, runtime5450f9d сохранён. SELECT core challenge + content quality; experimentation как способ проверки. Прочитаны Task Router, Project Selection, Content Quality3/5/9/11, Independent Audit4/5/7 и Experimentation3.3/3.4/6. KIT IMPACT NONE: частный порядок поиска в игре, не общий framework.

## Наблюдение и одна гипотеза

D96: full1491 попытка, только15 новых hands в13/64 партиях; 692 no-blocked-piece,610 no-verified-task,103 baseline-already-task,62 quality-or-task-miss,9 proof-budget. Full content5,33% при пороге6,15%, общий FAIL. Гипотеза: shape-major порядок тратит бюджет каждого родителя на множество координат первых форм и не достигает части допустимого каталога. Это пока НЕ установленная причина.

Диагностика: на прежних80 engineering contexts8101xxx сравнить прежний порядок с одним round-robin порядком **только дополнительного прохода**: одна координата каждой допустимой формы по очереди. Исходный baseline v2, scoring, allow, depth/width/retention, доступный work, proof и quality guards прежние. Измерить distinct completed hands/shapes, кандидаты с той же наградой/не меньшим числом линий, новые независимые CHAIN/CHOICE, пропуски/UNKNOWN. Перехват completed не меняет RNG и meter; сравнение на буквально тех же inputs. Если причина не подтверждается — не внедрять режим ради самого нового режима.

Если engineering подтверждает полезность: один отдельно версионированный candidate v3, без изменения0.70/0.71. Только порядок дополнительного beam; общий work24000/резерв512, proof budgets и защита actual baseline hand/witness/RNG/controller сохраняются. Без увеличения частоты фаз, наград, каталога, окон и recovery3. До development записать точный algorithm SHA, после него не подстраивать числа или traversal на этой выборке.

## Свежая проверка до открытия данных

Reserve case IDs: dev8109001…8109016, holdout8110001…8110016. Алгоритм seed-plan D96: outcome-independent avalanche mix и xorshift до заданного authored opening/rotation; все8 шаблонов, dev rotations0/1, holdout2/3. Gameplay seeds общие внутри четырёх arms, RNG игрока независим. 16seeds ×4styles ×4arms=256 партий на stage, cap300/no revive. Старые8107xxx только engineering; старыеholdout8108xxx/8103xxx не открывать.

Численные guards D96 без изменений: задачи +max(1pp,20%) против control дляtasks и starts дляfull; ≥1 новый matchedCHAIN иCHOICE; ordinary≥85%; clear/three/lapse reward-rate≥75%; clear/lapse capped mean≤110%; p95≤1.25×control+2ms; work≤24000. На16 игр early deaths≤control+2, bounded reward-games≥control−2; fallback≤2×control+2. Все факторы/цензурирование/неуспехи раскрыть. Holdout только после полного devPASS, не выбирать победителя по нему.

Техническая регрессия: старые1120 private moves, прежние128 R3 и256 D96 outcomes без переинтерпретации; literal baseline при отказе, complete witnesses и независимые negative proofs, старые saves/receipts/earned recovery3/clock/worker. При отрицательном результате — HOLD, сохранить результаты и действующую0.71, не требовать телефон ради спасения proxy. При положительной модели — отдельная ручная APK после проверок, человеческий смысл/phone performance всё ещё не из ботов.
