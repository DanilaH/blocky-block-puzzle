# D102: полный базовый набор фигур, preview0.74

Владелец после плейтеста0.73 попросил сверить отсутствующие формы с оригиналами, добавить и повторить тест. Base7f7893d,веткаfeat/reference-shapes-20261118,неmain. Текущий0.73build остаётсяHOLD/manual; отзыв «очисток меньше» не принят за разрешение сделать егоосновным.

## Подтверждённые недостающие формы

Наша legacy-база31orientation; исправленный BlockBlast10.8.2 actualShapeInfo IDs1..42 содержит41uniquegeometry (один ID дублирует диагональ). Разница: **8L/J tetromino rotations/mirrors и2diagonal pairs**. Все8L/J независимо совпадают с1010!71.57.1136 Pieces_2. Теперь эти10форм доступны вregistry41и вновойвыдаче; старыеD3/L5 уже были в31,не выдаются за нововведение.

Сверены сохранённые результаты APK-разбора, actualruntime-shapes изcorrectedpass4,а не зеркальнаяR.rows. APK/Cocos/Unity здесь заново не запускались. Геометрия—обычные математические клетки,реализация иartсвои; чужие код/брендовыеассеты не копировались. [Версии, SHA иIDmapping](reference-shapes-2026-11-18/provenance.json). ExtendedBlockBlast43..51/101..111/200..203 не объявлены обычнымClassicpool;1010!4×4 mode-gated на10×10не добавлен внаш8×8пул автоматически.

## Реализация и сохранность игры

Ручной `director-shapes-v1 / reference-shapes-v1`,пункт«Все базовые фигуры · проба» на основе0.73. Обычныйdefaultостаётсявыбраннымchallenge-v2. LegacySHAPES31/order/weights/search/RNG заморожены; отдельныйALL_SHAPES41registry нужен дляnewIDrender/input/hints/save/replay/revive. У старыхполитик никаких новыхdraws. Старый0.73build также сохранён длясравнения. Authoritative challengeBuildState/window protocol прежний.

После полной обычной0.73выдачи меняется максимум один2/4cellslot на новуюформу той жеплощади. Двеостальныефигуры/цвета,RNG,controller сохраняются. Нужныпервоначально помещающаяся новаяформа иполныйprovenwitness сточно прежними lines/fullclear/finaloccupied. СертифицированныеCHAIN/CHOICE/ORDER/REWARD_CHOICE,старты,триearned recovery защищены. Miss/UNKNOWN возвращаетliteralbaseline. Дополнительныйproof входит впрежние24000work,не запускает ещёодин неограниченныйгенератор. Сортировка поrecentfamily иseed-derivedrank,никакогоизмененияauthoritativeRNG.

Алгоритм иgates frozenлокальнымa8960ed доfreshrollout. Позже исправлялисьтолькоsyntheticbrowserfixturerevision иbuildversion/workflow/docs; поиск/порог16/формаproofне тюнились после результатов. [Предварительныйпротокол](reference-shapes-2026-11-18/PROTOCOL.md).

## Результаты

Fresh128paired runs/15942moves:16новыхcases8122001..8122016 ×4старыхmixedstyle ×2policy(build0.73/shapes0.74),300cap. **Все10новыхID реально встретились**, втомчислеобаD2. Новыефигуры составили6,12–6,70%issuedpieces вчетырёхstyle;D2редки. Все20proxyguards exposure/ordinaryclears/lengthrange/earlyloss PASS. На каждом acceptedrefill independentlycell-provenwholetray,exactarea/twootherpieces/lines/fullclear/finaloccupied/RNG/controller; fallback/work/validprofile guards PASS. [Полныеанонимныеагрегаты](reference-shapes-2026-11-18/development-summary.json).

| Стиль | Mean capped length0.73→0.74 | Новыефигуры |
|---|---:|---:|
| bounded |29,44→26,50|6,12%|
| clear |71,94→79,12|6,70%|
| three |300,00→288,06|6,28%|
| lapse |103,06→98,25|6,16%|

Это engineeringdev,не человеческаяинтересность/A/B/ретеншн и не отмена прежнихD96/D97/D101FAIL. Старыеholdoutsзакрыты. Основнойбаланс не переключать поэтойтаблице.

Локально426unit/63files PASS.16новыхcorecases:41uniquegeometry/10sourcecross-checks,края/постановки,реальнаявыдачаall10нафиксированныхfixtures,полныйsame-area/rewardproof,неизменныестарты/recovery,save/capture/clock/decisionreplay,hintиrevive+duplicateнакаждомновомID. Все1414доступныхoriginalmoves пятизаписей exact+independentcells PASS,включаяновые294хода0.73. Исторические2187moves полного0.73release не объявляются заново доступными/повторёнными; originalsвGitнепубликуются.

Перваяобщаяunitпопытка дала425/426:во времяпрогона обновляласьверсия,модульуже загрузил0.73,Gradleуже содержал0.74. Повторпослефиксацииверсии426/426PASSбезослаблениятеста. Первыеlocalbrowser failures:одинHMRnavigation во времяобновленияAppVersion идвеsyntheticfixtures cнесвежимrevision;fixtureисправлен черезтекущийsave.revision+1,production savebarrierне менялся. Повтор иCIфиксируются вpublicationreportпослефактическогозавершения.

Version0.74/code74,прежнийpackage/signer,demo ads/analyticsOFF. Signature/payload/fullCI/доставкаAPK фиксируются отдельно. ФизическоеAndroidupdate/resume,видимость/feelновыхформ,нагрузка икабинет/liveSDK не доказаныdesktopпроверкой. AppMetricaотложенавладельцем. **KIT IMPACT NONE**:consumer-specific shapes/content policy;guidance4e826ff/runtime5450f9d,записипользователя/keys/APKнеGit.
