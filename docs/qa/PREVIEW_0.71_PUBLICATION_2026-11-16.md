# Preview 0.71: техническая поставка D96

Статус: полный [CI43900709468](https://github.com/DanilaH/blocky-block-puzzle/actions/runs/43900709468), attempt2, завершён **success**. 381unit/274browser/44focused/Android/2emulator PASS. Подписанная APK и запасной ZIP готовы к передаче после этого результата.

Source branch `feat/classic-preview` заморожена на **5be1d7b2bca92683593265fa2ab346c4eb173015**, tree **33f0d8ffa0b71463b267b0ebd625953091aea2d4**. PR1 checkout **0313b43ea5bf3ab5481e652096f0c88bbfd34eeb** имеет то же дерево. Приложение после этой точки не менялось. Последующие proof/docs — только work/challenge-balance-20261116 и рабочая ветка продолжения, не preview. PR остаётся draft, main не менялся.

| Проверка APK | Факт |
|---|---|
| Package |com.danilah.blocky.dev|
| Version |0.71.0-preview / code 71|
| Размер |11808929 байт|
| APK SHA-256 |cdf3d86108cd4ce154772d5bf4b392853feeb0132e7cd35820af823a78ff2ea5|
| Signer SHA-256 |e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13|
| Подпись |apksigner v2 verified, прежний cached key|
| Production файлы |99/99: совпали список и каждый байт|
| CI / local proof |полные JSON побайтно одинаковы|
| Android resources |ads_test_mode=true; AppMetrica и production ad IDs пустые|
| Запасной ZIP |11096796 байт, APK внутри побайтно совпадает; инструкция и SHA256SUMS приложены|

Владельцу подготовлены отдельные APK, ZIP, короткая инструкция и архив синтетических QA. ZIP для установки SHA-256 `6f68368382a244ef1475027384683acee82307b5d4fe1e68f427a1610700c1a9`. Архив QA: 452933 байта, SHA-256 `bbb1839ebbbcd0cd6802d700cd3738c45790ee283b1efd11df0bd845cd740fd1`; 15 файлов с raw synthetic результатами, provenance, admission counts и проверками APK/CI/legacy outcomes. Оригинальных записей, скриншотов, ключей и временных подписанных URL в нём нет. Эти пакеты в Git не добавляются.

Скачаны artifacts **14240313771** (APK ZIP SHA-256 `5a8c36efb9dbb018c3a1fcdef2094a59b722f6ba0770b32ddf4ca6aedd44cdd3`) и **14240773316** (proof ZIP SHA-256 `08baef9395f44a5b6aaa8379b530df9cb6711857e9265e8a8381183ae207e39c`) этого run. Проверены API digest и CRC архивов, затем официальные Android apksigner/aapt2, manifest/version/package, точный source marker/tree и все упакованные web-файлы. Прежний package, больший version code и прежний cert позволяют обновление; физические install/resume ещё требуют телефона. Ключ не создавался, uninstall не нужен.

Первая попытка verify прошла 381 unit и build, затем остановилась при установке браузерных зависимостей: на runner отсутствовали пакеты шрифтов Ubuntu. Игровые browser tests в этой попытке не запускались. После успешных Android/focused/emulator повторён только verify, **без изменения кода**. Повторная установка зависимостей успешна: 58 test files /381unit, Python5/8/4/7, native CDP и **274browser PASS (25,7 минуты)**; artifact upload и весь workflow success. Android/focused/emulator в первой попытке прошли и не пересобирались. Сбой подготовки сохранён в истории, код не менялся для повторной проверки.

## Воспроизводимые публичные checkpoints

Обычный Git dry-run push снова подтвердил отсутствие credentials. Ранее разрешённый владельцем whole UTF-8 tree API сохранил все три checkpoints и их порядок; каждый созданный tree совпал с локальным. Blob API, base64 и фрагменты файлов не использовались. Публиковались только Blocky, скрипты и агрегаты; исходные записи и полные синтетические состояния в Git не попали.

| Этап | Локальный checkpoint | Публичный эквивалент с тем же tree |
|---|---|---|
| Диагноз до коррекции |aa164e1ab1b4051e3a19c5cfeb89e34fcee20bc0|f857e5a895d3172f14d2c0d9eb0e08b1c819632f|
| Один алгоритм до dev |7a5ee756a1d958e2cd1478318b6b6c382cea7bc7|763a3216afe20f203a049c571dd1ac595a6f1592|
| Ручная сборка, UI и результаты |d06b20107c07bbfb58c817a796c7c5fadf93021a|5be1d7b2bca92683593265fa2ab346c4eb173015|

Для воспроизведения development использовать `compare.mjs development-v2` на публичном frozen algorithm 763a321 или release 5be1d7b. Последние изменения между ними — версия/UI, расширенные browser проверки, stress harness и отчёты; игровой алгоритм прежний. Для проверки APK checkout именно 5be1d7b / 0313b43, не последующее дерево документов.

## Граница приёмки

Manual/HOLD, основной v2 / rollout OFF. Новый режим «Задачи и старты · v2» исправляет побочные замены, режим «Задачи и старты · 0.70» сохранён. Из 256 свежих development партий полный вариант не прошёл content gate: 5,33% при минимуме 6,15%; абсолютное число задач 158 против 159 starts-only. Holdout 8108xxx и прежний 8103xxx закрыты. Подписанная сборка не означает принятия баланса, phone FPS, retention или денег.

Локально 381 unit / 17 browser / build / assets / public guard, 1120 точных исходных ходов с независимыми клеточными проверками, все 128 прежних R3 игр и 3600 desktop stress ходов PASS. Запись достигла лимита, игра продолжилась, ON/OFF hash совпал. Физический телефон, человеческая оценка задач и непройденный content gate остаются открытыми. AppMetrica отложена владельцем, demo ads. Новое revive window и ad cadence не входят. KIT IMPACT NONE.

[Результаты и ограничения](CHALLENGE_BALANCE_0.71_2026-11-16.md), [короткие инструкции](PLAYTEST_0.71_RU.txt).
