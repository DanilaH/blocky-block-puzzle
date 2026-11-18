# D101: один кандидат накопления поля поверх выбранного v2

Freeze до development-прогона. Base915da0d / APK0.72. Owner после новой записи попросил исправить повторные готовые очистки на пустой доске. Это новое конкретное основание после остановки общего тюнинга D99; не открывать D96/D97 holdouts.

Наблюдение:382 exact+independent-cell moves,2 сыгранные партии и1 пустой новый старт.126 пополнений;11/11 на пустом поле содержат witnessed full-clear,19/24 приoccupied<=8. Все24 совпадают с обычным baseline; extra v2 заменил только2/126, обе замены не на пустом поле. Witness означает возможность, не обещание человеческой лёгкости: фактически1/11 empty и7/24 low8 лотков дали full-clear за следующие3хода. Оригинал/UUID/доски/координаты/полные временные ряды остаются приватными.

## Единственная гипотеза и алгоритм

Отдельная policy `director-build-v1`, config `challenge-build-v1`, отдельный authoritative `challengeBuildState`. На входе occupied<=16, кроме earned recovery: пропустить точный поиск full-clear и убрать бонус за линии/full-clear в обычной оценке. Остальные слагаемые и целевое заполнение16 прежние. Load-scoring, малые фигуры rest, счётчики prepare/payoff/load, каталог, authored starts/anti-repeat, RNG, budgets24000, окна и strict verified CHAIN/CHOICE прежние. На occupied>16 и в3earned recovery поведение буквально прежнее. Порог16 фиксируется до нового model rollout; не подбирать его по результату.

Основная обычная новая партия остаётся выбранным `director-challenge-v2`; кандидат доступен только вручную. v3 остаётся скрытой исследовательской версией. Эксперименты OFF; установка/assignment/права/лоток/счёт/сохранённая policy не мигрируют. Revive selector/reward не менять. Test ads/demo и analyticsOFF, AppMetrica отложена владельцем.

## Проверки и заранее заданные ограничения

1. Все старые исходные ходы exact+independent cells; старыйv2 не переопределён. Все новые witness независимыми клетками; бюджет<=24000, valid durable profile/worker/capture/replay/clock и строгое сохранение earned recovery.
2. Те же126 входов записи: пустые witnessed-full-clear лотки <=2/11 (раньше11), low8 <=9/24 (раньше19). Это regression на установленную причину, не независимая оценка баланса. На count>16/recovery совпадают tray/witness/RNG/controller.
3. Свежие dev cases8121001..8121016, заранее стратифицированные по8authored openings × rotations0/1, четыре прежних mixed styles bounded/clear/three/lapse, одна параselected-v2/build наcase/style,300ходов cap. Всего128запусков. Player seed и активные интервалы прежней методики; порядок вариантов чередуется. Старые hidden8103/8108/8110 не читать.
4. На каждыйstyle: частота ordinary clear moves/100moves >=75%baseline; mean capped length иp90 <=110%baseline; mean length>=65%baseline; доля поражений<=12ходов не вышеbaseline+5п.п.; CHAIN/CHOICE opportunities после36ходов >=70%baseline. Отдельно описать занятость, full-clear, достигшие cap и реальные неизвестности. Нельзя заменять критерии после просмотра результатов.
5. ModelFAIL не означает сломанную игру и не даёт автоматического adoption. При всех технических PASS владелец уже заказал ручной кандидат/APK; раскрыть неуспех и оставить HOLD/manual. При correctness failure APK не выдавать. Одной итерацией не обещать human fun/retention/доход; телефон/оценка владельца отдельно.

## Источники и границы

Blocky AGENTS/DECISIONS/ROADMAP/spec§11 и актуальный запрос владельца. Guidance mini-games-kit ad9ad52d6fc2d4025252698b2428c011eb90d813:AGENTS,TaskRouter,ProjectSelection,ContentQuality+independent audit; UI route для одной строки существующего переключателя и Android release acceptance. Runtime pin5450f9db344aacb5acdc103b4199fd8aeb11b10d не обновляется. KIT IMPACT NONE: consumer-specific balance, общий код вkit не выносится. Реального телефона/SDK/кабинета/кассы эти проверки не заменяют.
