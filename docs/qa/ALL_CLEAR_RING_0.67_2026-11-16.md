# D93 / preview0.67: убрать bitmap-ring полной очистки

Владелец после0.66: лагов меньше, оставшийся рывок при очистке доски,
когда «кривое PNG какого-то кольца летит в экран». Новый phone trace не получен.
На актуальной D92/public0c4e468 (не main) убран только full-clear bitmap-ring,
включая его повтор в cross-ветке того же хода. Непустые cross прежние.
Flash/контур/осколки/конфетти/награда/фон/материал/звук сохранены; новых
слоёв/объектов/таймеров нет. Ядро, выдачи, save/revive/права/SDK не менялись.
Diagnostic bitmap/off transient, не GameState; обычная игра off.

ring.webp492×502/65122bytes загружен до ввода, full-clear растягивал его
130→750logical px при поле512; в400–650мс мог накладываться cross-ring.
Альфа центра прозрачная. Не утверждаем, что PNG/decode/network являются
причиной рывка. Телефонный выигрыш не установлен.

## Сравнение15.11 и восстановление16.11

До блокировки публикации проверены ABC,BCA,CAB: A bitmap / B только actor off /
C одна native Graphics волна, radius65→230,width4,alpha sin(pi*t)*.7,
400–1000мс. Один Graphics предварительно выделен во всех A/B/C. C не принят:
нет устойчивого выигрыша, новый слой не добавлен. Выбран B по визуальному
замечанию владельца; существующая рамка уже даёт контур очистки.

Финальный runtime отдельно проверен ABBAAB, без дополнительного Graphics.
Полный обычный UI/prepared surfaces, synthetic O3 full-clear6 линий,
streak19/score12000/festival-v4/director-v2; оставшиеся S1,S1,без refill.
Festival seed12345,sound off. После durable commit2500мс ожидания; capture
включает ввод/save wall time, exposure различается. Headless Chromium141/Linux,
не телефон/present/GPU timing. Снимки отдельно от timing, Board impact700мс.

|Проба|Вариант|RAF mean по эпизодам, мс|RAF p95, мс|boardDraw mean, мс|
|---|---|---|---|---|
|ABC|A bitmap|22.66;35.41;23.77|50.1;66.7;50.0|0.433;0.865;0.523|
|ABC|B off|23.13;32.20;25.06|50.0;100.1;50.0|0.428;0.552;0.449|
|ABC|C wave|24.24;28.20;26.47|66.6;83.2;66.7|0.453;0.609;0.888|
|Final AB|A bitmap|24.77;42.29;26.01|66.7;166.6;83.3|0.414;0.753;0.389|
|Final AB|B off|24.94;24.46;28.23|66.7;66.6;66.7|0.434;0.427;0.466|

Все15 эпизодов: exact hash5fec4dff/score44509,6 линий,пустая доска,Festival110.
A bitmap до739.15logical px; B/C0 ring calls. Scene objects1250→1250 с C,
1249→1249 в финале. Atomic-save wall64.5–206.1мс отдельно от boardDraw;
это не CPU. Не выводить phone speedup из этих шумных измерений.

Публикация15.11 отклонена auto-review; владелец явно подтвердил16.11
публикацию этой правки в публичный Blocky и Actions. За паузу scratch reset:
неопубликованные commitb526781/0d1eba9 и raw JSON/скриншоты прежней проверки
недоступны. Таблица выше восстановлена из сохранённого текста протокола,
не выдаётся за заново измеренные raw traces. Восстановленный BoardScene
побайтно совпадает с прежней правкой: blob
be6aac47b2e361cb135d8bc8f4051d438a7b4a6c. Новых performance-кандидатов нет.
Шесть browser regressions восстановлены и проходят повторную проверку.

## Техническая поставка

Ранее339 unit/31 targeted browser/build/assets PASS; при восстановлении
16.11 повторно339 unit/6 новых browser/build/assets PASS. Окончательный
CI/APK proof записывается отдельно.
Новые6 regressions: exact state/reward/Festival110, отсутствие asset requests,
bounded objects, pause/new piece/reload/system reduced motion, прежний bitmap
у непустого cross. Focused CI включает этот файл и25 существующих scenarios.

Preview0.67/code67,com.danilah.blocky.dev,demo ads,AppMetrica off. Только старый
signer PR1 cache; новый ключ не создавать, владельца не просить uninstall.
Исходные пользовательские записи/бинарники/ключи в Git не добавляются.
mini-games-kit не меняется. Default v2/composition-v2 HOLD/rollout OFF прежние.

Телефон: update/resume,1–2 полных очистки с обычным звуком/вибрацией,
оценка оставшегося рывка и вида. Новая длинная запись не обязательна.
