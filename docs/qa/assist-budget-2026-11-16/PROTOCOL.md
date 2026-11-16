# D94: конечная помощь, одна проверяемая интервенция

База5390af7/source86daf152,preview0.67,без старого main. Full PR1 CI43815781553
завершился success (включая verify),ничего не пересобираем ради старого кольца.
TZ из Blocky_TZ.zip SHA256 e3a0650a996aebd29e9a81886e71e48ab4e5eb1a7afbcbd033e0125dd2825d72.
Реализуем первую итерацию: current-state audit → финальная decision trace без
изменения игры → один отдельный кандидат конечной discretionary помощи.
Новые фазы/challenge mix,revive window,ad cadence — следующие отдельные этапы.
Три текущих recovery/earned права/экономика/сохранения/подача остаются прежними.

Baseline ДО числовой конфигурации кандидата:director-v2 и composition-v2(HOLD),
seeds7601001…7601008,4 стиля bounded/clear/three/lapse,cap300 moves,без revive.
Боты видят только board/tray,не witness/director/budget. Player RNG независим,
одинаков по seed/style; censor=300 не считать поражением. Это64 synthetic runs.
Структурный audit:requested/actual/source/работа/роли/clear/all-clear раздельно.
Для недостающей контрольной трассы повторить pure deal по точному контексту,
сверить tray/RNG/controller. Второй вызов вне измеряемого applyMove; времена
этого census не считаются телефонным FPS/CPU worker или приёмкой плавности.

Dev сравнение одного frozen кандидата с v2 на тех же8 seeds/4styles/cap300.
Новый holdout7602001…7602008/4styles/cap300 открывать только ПОСЛЕ фиксации
конфигурации и gates. D91 holdout6102xxx не использовать для настройки.
Если новая политика не проходит gates — HOLD/REJECT,не перенастраивать по
holdout и не объявлять default по автотестам. Никакого fixed-time forced loss.

A/A trace:сравнить exact tray/RNG/controller/game hashes с frozen0.67,
включая composition post-process и timeout,не просто первый requested family.
UNKNOWN не UNSOLVABLE. Каждый SOLVABLE witness исполнить независимыми клетками
и реальным place/applyMove; асимметрия/slot mapping/одновременная очистка.
Настоящие записи владельца найти и replay; исходники только private-inputs.

Числа help budget и acceptance будут записаны ПОСЛЕ baseline,ДО candidate dev
и untouched holdout. Без одновременных browser/build jobs при compute timing.
После технических проверок — manual preview(demo ads/analytics off),только
если candidate безопасен для сравнения. Balance defaultv2/rolloutOFF/HOLD.

Guidance read:mini-games-kit ca427723be378ad30531c2c976b61ef95cbf1e29,
Task Router → block-puzzles/pass4(correction/addendum)+iOS delta,
Project Selection/Playbook(Challenge+Experimentation),Reference Protocol,
Kit Feedback Loop. Runtime API pin5450f9d сохраняется; нового kit runtime нет.
Выдача/бюджет относятся к Blocky,KIT IMPACT NONE,consumer отчёты в kit не писать.

## Frozen candidate после baseline,до candidate dev/holdout

Новая версия director-budget-v1;старые v2/composition не меняются.
Baseline64 runs:у bounded6/8 ранних смертей≤36,поэтому первые12 исходных
выдач(36 постановок) сохраняем в точности. Это конечный early сегмент текущей
политики,не возобновляемый run credit. Все3 revive recovery также прежние:
это уже обещанная reward-value,не discretionary помощник и не общий cooldown.

После early:ordinary использует тот же конструктивный goal beam,сохраняет
обычные линии/геометрию/нагрузку,не выполняет extra exact-clear и не включает
бесплатный rest/payoff заново. Нормальный whole-hand witness всегда бесплатен.
Дополнительный старый reward-biased кандидат проверяется только при доступе:
runCredits5,cap reward5/relief2,минимум2 завершённых лотка между applied help.
Оба поиска≤11900work+≤12 transition/proof operations,общий потолок24000.
Credit расходуется только если финальный лоток отличается от ordinary и
его исполненный witness даёт больше линий ИЛИ all-clears. Иначе ordinary,
не расходуем credit/cooldown и не продвигаем RNG отвергнутого кандидата.
Сохраняется RNG выбранного плана. Five credits не задают время поражения.

Gates для dev и untouched holdout отдельно:
- exact early12/recovery3 equivalence,старые hashes/receipts/replay PASS;
- ранние смерти≤36 не выше control;ordinary clear-move rate≥80% control;
- clear/lapse:сумма ходов после72≤90% control,если были late exposures;
  bounded без late exposures — UNKNOWN,не выдумывать улучшение;
- strong three:полные награды на ход≥25% control,median duration не хуже
  bounded;сильную длинную партию не заставлять завершаться;
- trace SOLVABLE всегда имеет исполнимый whole witness,work≤24000,
  credits монотонны,не reset от all-clear/new-day/resume/record/revive;
- technical fallback count≤2*control+1 per8 runs/style;никакой помощи за ads;
- p95 refill compute≤1.25*control+2мс на последовательном CPU-only прогоне;
  browser/worker wall/physical phone отдельно. Работа не растёт без границ.

Это проектные guards/гипотезы,не нормы рынка и не обещание revenue/fun.
Конфигурацию/пороги не перенастраивать после dev или раскрытия holdout.
Перед dev выполняются unit/equivalence и1120 exact/independent human replay.
