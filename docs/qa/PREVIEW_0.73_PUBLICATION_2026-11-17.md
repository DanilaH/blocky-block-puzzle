# D101 / preview0.73: ручная проба накопления поля

17.11.2026. [Алгоритм, результаты и два отрицательных model guards](SPARSE_BUILD_0.73_2026-11-17.md). Кандидат только manual/HOLD; обычный новый запуск остаётся выбранным challenge-v2. Owner попросил реализовать одну итерацию после новой записи0.72, не вернуться к общему тюнингу или заменить default по автотестам.

## Точный source и проверенный APK

- Work/source `7f3f5274a29d9c17099865aa9f568ae5d5fbebec`, source tree `ad71036cc3a00ef8f8b43242ce8af2d0e264798e`. Публикация целого UTF-8 дерева29файлов поверх915da0d, неmain. Обычный Git не имеет write credentials; публичный fetch успешен, whole-tree API разрешён ранее. Blob API/base64/фрагменты файлов не использованы. Локальный freeze4e79497 и delivery ed7b902 сохранены backup-веткой; tree API точно совпал.
- PR1 checkout `be0da12a1b4e37c0f0a20c4038f81d71d55c9426`, тот же tree. `feat/classic-preview` заморожена на source7f3f527; последующие proof/docs только work. Main/магазин не менялись, PR остаётся draft.
- Package `com.danilah.blocky.dev`, версия `0.73.0-preview`, code73.
- APK **11810849байт**, SHA-256 **9e269bae9419dcb5de88becbf18fd29346a0557ec0fb46f423abb32db55a494b**.
- Прежний сертификат SHA-256 **e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13**, official apksigner v2 PASS. Новый ключ не создавался. Для обновления игру не удалять.
- Все99productionfiles и каждый байт совпали с воспроизведённым dist на точном PR source marker; **полные CI/local verification JSON побайтно одинаковы**. Official aapt2 manifest/package/version и compiled resources:ads_test_mode=true, AppMetrica и3production ad IDs пустые;zipalign16KiB PASS. [Proof](preview-073-2026-11-17/apk-verification.json),[resources](preview-073-2026-11-17/resources.json).

APK artifact14315624430/proof14315588934 изPR run44056991012. Digest ZIP-артефактов совпал сGitHub API: APK `afa4028328237c83894fb5c6802f1a40f5b546e92420e55ef51c092885ab4696`, proof `fff693269c6f1bce68c0e173b93c58b3ee5d04cd5d1e869cdc0d57b2cdcae580`;ZIP CRC PASS. ГотовыеAPK/ZIP/инструкция сохранены владельцу отдельно. ЗапаснойZIP11097211байт/SHA64b37937938c57f47bba4a0f14967222c6137280bd86929de360153c496e9ea3, внутри тот жеAPK/README/SHA256SUMS. Инструкция3018байт. Бинарники, ключи и исходные записи не вGit.

## Проверки

- Локально408unit/62files,20browser, build/assets/public-data guard PASS. Все2187ходов семи исходных записей exact+independent cells. Первая browser попытка остановилась до исполнения из-за отсутствующего executable; штатная установка headless Chromium и повтор20/20PASS, игровых исправлений для этого не требовалось.
- Новыеcore/worker cases проверяют sparse accumulation, прежний dense/recovery результат, earnedrevive/duplicate/3recovery, отдельный durablestate/clock/capture/replay, stale worker/cancel/retry и неизменный default. Новые4browser cases —320/390, history/anti-repeat, durable save failure/retry и настоящий worker с observed time/export/replay. Старые0.71source fixtures сохраняют earned hints/receipt/revive и реальное продолжение. Старые0.72игры дополнительно покрыты точным replay, физическое обновление не заявлено.
- 3600desktop accepted moves:1800captureOFF/1800ON, одинаковый finalhash;933capturedmoves/800100bytes,limit сработал и игра продолжилась. Profile<=1341bytes, content<=316, clockring8. Это Node/core/capture, не телефонный FPS/нагрев или живая SDK. [Агрегаты](sparse-build-2026-11-17/long-session-summary.json).
- Fresh128runs/21570moves,22/24styleguards:clear/lapse minimumlengthFAIL. КандидатHOLD/manual, порог16 не перенастраивался после результата, hiddenholdouts не открывались. Модельная техническая корректность не принимает человеческий баланс.
- ПолныйPR CI44056991012:core/408unit/62files/Python5/8/4/7,54focused,Androidunit/build/signature и2emulator PASS. Все284browser PASS:101+93+90 на трёх single-worker runners; verify требует core и каждыйshard, полныйrun attempt1 success. [АнонимныйCI-итог](preview-073-2026-11-17/ci-summary.json).

Параллельный push run44056981960 остановил Android на проверке сертификата: branch-scoped cache содержал другую signing identity. Защитный gate сохранён; из этогоrun APK не выдаётся, подмены ключа или обхода проверки нет. Поставка взята изPR1 run с исходным проверенным signer. Не выдавать этот push за успешный полный CI.

## Что проверить владельцу

Обновить поверх0.72без удаления; старая партия/права должны сохраниться. Пауза →«Начать заново» →«Другие варианты выдачи» →«Накопление поля · проба» →«Новая партия». Каждую пробную партию выбирать явно: обычная новая/повтор после поражения остаётсяv2. Одна-две партии; сравнить наполнение после очистки, сохранность интересных задач/наград и жёсткость после ошибки. Запись желательна, ощущения тоже полезны. После нового отзыва отдельно решитьADOPT/HOLD/REJECT; автотестыdefault не переключают.

Физические Android update/resume/FPS/нагрев/память, live ads/ILRD/кабинет/деньги не доказаны; AppMetrica отложена, рекламаdemo/analyticsOFF. Guidancead9ad52/runtime5450f9d,KIT IMPACT NONE: исключительно consumer-specific policy вBlocky.
