# D101: ручной кандидат «Накопление поля» поверх выбранного v2

17.11.2026. По новой конкретной жалобе владельца после D100. Base915da0d, не main. Единственный алгоритм и критерии заморожены локальным commit4e79497 до fresh development; параметры после результата не менялись. [Предварительный протокол](sparse-build-2026-11-17/PROTOCOL.md).

## Что исправляет кандидат

`director-build-v1 / challenge-build-v1`, отдельный сохраняемый `challengeBuildState`. При occupied<=16, кроме earned recovery, базовый поиск пропускает exact full-clear и не получает бонус за ordinary lines/full-clear. Остальная оценка, целевое заполнение16, каталог, authored openings и anti-repeat, RNG, бюджет24000, фазы/счётчики, малые фигуры rest и strict verified task admission прежние. Это уменьшение приоритета готовой награды, не запрет очищать линии и не выдача неразыгрываемых троек. На occupied>16/recovery прежний результат, включая witness/RNG/controller.

Кандидат доступен в прежнем ручном переключателе как «Накопление поля · проба». Обычная новая партия остаётся выбранным владельцем challenge-v2. Старые игры продолжают сохранённую policy, assignment IDs и earned-права не сбрасываются. v3 скрыт, audience configs OFF, rewards/revive selector и ad cadence прежние. APK0.73/code73 сохраняет package и исходную signing identity; точная проверка собранного APK публикуется отдельно. Реклама demo, аналитика OFF, AppMetrica отложена владельцем.

## Установленная причина и regression

Последняя запись0.72:382 exact moves, независимые клетки/линии/full-clear;2 сыгранные партии и1 пустой старт.126 пополнений.11/11 пустых и19/24 low8 лотков содержали witnessed full-clear. Все24 совпали с базовой выдачей: extra v2 заменил только2/126, на occupied13/26. Возможность не равна совершённому действию: фактически1 из11 empty и7 из24 low8 лотков закончились full-clear в следующие3хода. Источник — обычное начисление высокой ценности full-clear даже в rest.

На тех же126 входах candidate: empty0/11 иlow8 0/24; обе заранее заданные regression-границы PASS. Все71 dense/recovery результата совпали поtray/witness/RNG/controller, все witness независимо проверены клетками и work<=24000. Это fixed-input regression, не проигрывание старых человеческих действий под изменённой policy. [Анонимный итог](sparse-build-2026-11-17/record-regression.json).

## Свежая инженерная проверка и открытый FAIL

128 запусков/21570 ходов:16 заранее стратифицированных новых cases8121001..8121016 ×4mixed styles ×2policy;300ходов cap. Парные одинаковые seed/исходный authored opening/player RNG; после первой изменённой выдачи действия моделей расходятся естественно. Все issued witness/valid profile/work/заявленные CHAIN/CHOICE proofs PASS, fallback0. Hidden8103/8108/8110 не открывались.

| Стиль модели | Mean capped length v2 → кандидат | Mean occupied v2 → кандидат | Ordinary clear moves/100 v2 → кандидат |
|---|---:|---:|---:|
| bounded |40,25 →38,25|16,43 →19,10|51,55 →51,14|
| clear |229,56 →141,94|12,73 →17,60|43,02 →49,76|
| three |300,00 →288,31|7,40 →15,64|32,06 →51,14|
| lapse |202,44 →107,38|12,19 →18,82|44,40 →53,26|

22/24 заранее заданных style guards PASS. **Два FAIL: minimum mean length>=65%baseline дляclear (61,83%) иlapse (53,04%).** В этих моделях сокращение сильнее допустимого; общего model acceptance нет. Не менять порог16/границы и не выбирать другое RNG после результата. Длиннее партии не стали, premature losses<=12ходов0 в обоих вариантах. CHAIN/CHOICE opportunity rates выросли во всех4стилях; это формально доказанные возможности, не доказательство человеческой интересности. Сильный three-бот достиг cap в16/16 baseline и15/16 candidate: бесконечный хвост этим экспериментом не исключён. [Полный анонимный итог](sparse-build-2026-11-17/development-summary.json).

**HOLD/manual.** Владелец заранее заказал отдельный ручной кандидат при технической корректности. APK для проверки этой одной гипотезы, не новый основной баланс. Человеку оценить, успевает ли поле наполниться и сохранилось ли приятное чередование подготовки/задачи/награды; отдельно проверить, не стало ли слишком жёстко.

## Проверки поставки

Локально408unit/62files, build PASS. Новые5core tests: empty rest accumulation, dense/recovery equivalence, отдельный state/clock/capture/decision replay, прежние earned revive/duplicate/3recovery, manual history/defaultOFF. Ещё2worker cases включаютcandidate в cancellation/stale response и observed time через refill/retry. Browser/UI/long-session/CI и подписанный APK фиксируются отдельным publication-протоколом после фактического завершения; этот документ сам по себе их не объявляет PASS.

Источники: новая owner-запись, текущий source, game-kit guidancead9ad52:ProjectSelection,ContentQuality+independent audit, точечные UI/Android acceptance. Runtime5450f9d прежний. **KIT IMPACT NONE:** policy/баланс относятся кBlocky. Исходные записи/доски/UUID/координаты/keys/APK не вGit. Физический Android update/resume/FPS/нагрев, liveSDK/кабинет/реальные деньги остаются отдельными; запись и desktop/core не заменяют телефон.
