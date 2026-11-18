# Preview0.70: точная техническая поставка D95

Статус: полный [CI43869146345](https://github.com/DanilaH/blocky-block-puzzle/actions/runs/43869146345) завершён success:367unit/270browser/40focused/Android/2emulator PASS. APK передаётся владельцу после этого результата.

Source branch feat/classic-preview заморожена на **a9b03f3990ec60df991e18acb24b701781f7ada1**, tree **0454cd231dc7a16cfd4be440bf8c8be342a4cdee**. PR1 Actions43869146345 checkout **40f8726ef48c48e96509e0c59867d668ef870f89** с тем же tree. Последующие proof/docs только вfeature/work; preview не двигать ради документации. PR остаётся draft, main не менялся.

| Проверка APK | Факт |
|---|---|
| Package | com.danilah.blocky.dev |
| Version |0.70.0-preview / code70|
| Размер |11804501bytes|
| APK SHA-256 |c5c1e02915eb8b905cead0d5819ec681f7020d0a121884f6855d505a2bf8bcfc|
| Signer SHA-256 |e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13|
| Подпись | apksigner v2 verified, прежний cached key |
| Production файлы |99/99, каждый byte и список entries совпали|
| CI/local proof | полные JSON побайтно одинаковы |
| Packaged Android resources | ads_test_mode=true, AppMetrica/ad unit IDs пустые |

Скачаны именно artifacts14227510945 (APK ZIP SHA504f895c410e31d3438a3e49c88d6b15a87bf687f143db017f9726fdfb2c090f) и14227106276 (proof ZIP SHA65f3458834346597ce6d1d23a53507d487533fef04343e814350a9ff3141a7b2) этого PR run. Архивы сверены по API digest, затем официальный Android apksigner/aapt2, manifest/version/package, все dist файлы, точный source marker/tree и demo/off resources проверены локально. Новый key не создавался; совместимость обновления по package/code/cert есть, физический install/resume — ещё phone gate.

Локально367 unit,22 browser,1120 exact/independent legacy moves,7200 serial desktop accepted moves,build/assets/public-data guard PASS. CI40focused иAndroid native unit/assemble PASS; emulator **OK(2 tests)**. Полный verify:57 test files/367 unit и270 browser PASS, браузерный прогон22.0минуты. Workflow целиком success; физический телефон не проверен.

## Публичные эквиваленты frozen source

Обычный Git dry-run push вновь дал `could not read Username`. Использован ранее явно разрешённый whole UTF-8 tree API, без blob API/base64/фрагментов файлов. Сохранены все три source checkpoints и их история; созданные remote trees точно совпали с локальными. Полные synthetic states и исходные записи не публиковались.

| Поколение | Локальный freeze | Публичный эквивалент с тем же tree |
|---|---|---|
| R1 |0ceef8d1ae570d3c87ef03e67c355167366a2c6c|e6c4e2e7e054285f5d721130d0ddd02dc9501f49|
| R2 |009e8021923c85faac6dad3b3897597cefd97f3f|ed8004b1e66dc2163905d0cbb500adc28607c55b|
| R3 |07f9836a8757e712cef52b910a727dff9130e7e6|e07d71197bf0392af8c22cac4bc089b9a9046f78|
| Техническая поставка |af8b34e8f734f5e478b70b5901647f8661d2b466|a9b03f3990ec60df991e18acb24b701781f7ada1|

Все публичные checkpoints достижимы из текущей source branch. Для воспроизведения checkout соответствующего поколения и его compare.mjs: development / development-r2 / development-r3. Сырые синтетические данные, provenance и APK proof отдельно сохранены для владельца; ни одного owner recording или signed URL в архиве нет.

## Граница приёмки

Это manual/HOLD-исследовательская APK «Задачи и старты», defaultv2/rolloutOFF. Она не закрывает общий factorial gate: tasks-only в R3 не проходит reward/tail. Holdout8103xxx не открыт. Даже зелёный полный CI не означает одобренный баланс, phone FPS, retention или деньги. Старый revive/reward/rights/recovery3 сохранены; новое окно revive, ad cadence/кабинет и AppMetrica не делались.

[Реализация и модельные неуспехи](CHALLENGE_CONTENT_0.70_2026-11-16.md). Для телефона — обновление поверх0.69, drag/refill/foreground/demo reward/оставшиеся рывки; для владельца — первые решения/осмысленность задач/удовольствие от очисток. Запись встроенных ходов достаточна, видео необязательно. KIT IMPACT NONE, публикация только вBlocky.
