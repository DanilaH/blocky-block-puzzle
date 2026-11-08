# Сборка и границы preview

Node 24, зависимости зафиксированы package-lock.json. После клонирования:

```sh
npm ci
npm test
npm run build
npm run dev
```

Браузерные проверки:

```sh
npx playwright install chromium
npm run test:e2e
```

Android: JDK 21, Android SDK 36, build-tools 36.0.0. На Linux/macOS:

```sh
npm run android:sync
cd android
./gradlew assembleDebug
```

APK: android/app/build/outputs/apk/debug/app-debug.apk. Workflow `Preview checks and APK` сначала проверяет web/unit, затем собирает debug APK и сохраняет artifact на 14 дней. Это debug-подпись CI, не ключ выпуска. В 0.6 путь debug-keystore явно согласован между генерацией, Gradle и кешем CI. В прежних запусках кешируемый путь отсутствовал, ключи менялись. Новая 0.6 не обновляет выданную 0.5 из-за другой подписи; удаление старой версии удаляет её данные. Кеш не заменяет долговечный секрет: до широкой раздачи нужен постоянный ключ в защищённом хранилище.

Временный собственный package: com.danilah.blocky.dev. Production package и ключ подписи не выбирались. Встроен Capacitor App для Back/appStateChange. Сохранение пока через IndexedDB WebView; атомарность транзакций проверяется отдельно от сохранности на физических Android. Android backup выключен, облачного восстановления не обещаем.

В preview работают правила Classic, перенос, подсказка worker, локальное сохранение, пауза, правила, новая партия, результат, трёхшаговое обучение, SFX и спокойные эффекты. Это не законченный первый APK из M1: нет нативной рекламы, reward/revive, аудиофокуса, второй темы, музыки, аналитики и проверки на реальном телефоне. Пустая нижняя область — резерв под баннер, не загруженное объявление. Бесплатные подсказки — 3 в день; после исчерпания честное сообщение, без фиктивного rewarded.

Основной прототип использует initial-v1. Экспериментальная solvable-v1 и доказательство тройки доступны в модуле core для дальнейшего сравнения; UI выбора алгоритма не нужен обычному игроку. Длительность сессий и релизная выдача не утверждены.

Проверены первичные справки при подготовке: https://capacitorjs.com/docs/getting-started/environment-setup, https://capacitorjs.com/docs/updating/8-0, https://docs.phaser.io/phaser/concepts/input. Конкретные зависимости проверены через npm registry и закреплены lockfile.

Preview 0.7: сертификат финального APK совпадает с выданной 0.6 (`e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13`), applicationId прежний, versionCode 7. Сборка рассчитана на обновление поверх 0.6; установка на физический Android не проверена. [Протокол 0.7](qa/FEEL_0.7_2026-10-25.md).

Preview 0.8: versionCode 8, тот же applicationId и сертификат, что у выданной 0.7. [Проверки, подпись и APK-хеш](qa/FEEL_0.8_2026-10-25.md). Фактическая установка обновления на телефон остаётся непроверенной.

Preview 0.9: versionCode 9, прежний applicationId и сертификат 0.8; 47 автотестов и Android CI прошли. [Протокол, симуляции и APK-хеш](qa/FEEL_0.9_2026-10-26.md). Установка обновления на физический телефон ещё не проверена.

Preview 0.10: versionCode 10, прежний applicationId и сертификат 0.9; 59 автотестов и Android CI прошли. [Протокол, сравнение со звуком и APK-хеш](qa/FEEL_0.10_2026-10-26.md). Физическая установка обновления остаётся непроверенной.

Preview 0.11: versionCode 11, прежний applicationId и сертификат 0.10; 69 автотестов и Android CI прошли. [Новое оформление, исправления восстановления и APK-хеш](qa/FEEL_0.11_2026-10-26.md). Фактическая установка обновления и ощущения на телефоне остаются непроверенными.

Preview 0.12: versionCode 12, прежний applicationId и сертификат 0.11; 73 автотеста и Android CI прошли. [Читаемость, материал очистки и APK-хеш](qa/FEEL_0.12_2026-10-26.md). Фактическая установка обновления на телефон остаётся непроверенной.

Preview 0.13: versionCode 13, прежний applicationId и сертификат 0.12; 78 автотестов и Android CI прошли. [Исправления usability и APK-хеш](qa/USABILITY_FIXES_0.13_2026-10-27.md). Физическая установка обновления остаётся непроверенной.

Preview 0.14: versionCode 14, тот же applicationId и сертификат 0.13. 81 автотест и Android CI прошли. [Новая подача, запись сравнения и APK-хеш](qa/FEEL_0.14_2026-10-27.md). Аппаратная и эстетическая приёмка остаются открытыми.


## Preview 0.15
`versionCode=15`, `versionName=0.15.0-preview`. Та же тестовая package/signing configuration. Чтобы проверить серию с двумя подготовительными ходами, начать новую партию. Незавершённые сохранения 0.14 и старше не меняют правила посреди игры. Выдача фигур не изменена. Детали и фактические проверки: [FEEL_0.15_2026-10-27.md](qa/FEEL_0.15_2026-10-27.md).

## Preview 0.16
Выбор для сравнения: «Пауза → Новая партия → Выдача в новой партии». Варианты: обычная и с умеренной помощью; отмена сохраняет текущую партию. «Ещё раз» сохраняет предыдущий вариант. Первый запуск остаётся обычным. Рекорд общий. [Проверки и ограничения](qa/DEALER_0.16_2026-10-27.md).

## Preview 0.17
Добавлен Yandex Mobile Ads SDK 8.6.0: native banner/interstitial/rewarded и сохраняемые награды. Debug использует demo IDs. В браузере без native SDK реклама недоступна, игра работает. Для release нужны три собственных переменных окружения `YANDEX_BANNER_AD_UNIT_ID`, `YANDEX_INTERSTITIAL_AD_UNIT_ID`, `YANDEX_REWARDED_AD_UNIT_ID`; отсутствие корректных значений блокирует release build. Не подменять demo IDs production-значениями в debug. Ранее приведённое описание «нет нативной рекламы/reward/revive» относится к 0.16 и старше. [Проверки 0.17](qa/ADS_0.17_2026-10-28.md). Реальные показы на устройстве не подтверждены.

### Preview signing continuity (0.22)
GitHub Actions signing caches are ref-scoped. User APK 0.21 and compatible 0.22 come from PR #1 / feat/classic-preview. An experimental branch may generate a different debug key despite using the same cache key. Always verify the final signer fingerprint against the previously delivered APK before handing out an update. Expected preview fingerprint: e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13. Do not ask users to uninstall to hide a signing mismatch. A durable signing secret remains a release requirement.

## Preview 0.23
VersionCode 23, versionName 0.23.0-preview; APK из PR #1 / CI 41116476674. 174 автопроверки и Android CI прошли. Сертификат e96d961e…fdbe13 совпадает с 0.22; 16 production-файлов проверены побайтово. Физическая установка остаётся непроверенной. [Протокол](qa/ENAMEL_0.23_2026-10-31.md).


## Аналитика с preview 0.31

Debug использует только `APPMETRICA_TEST_API_KEY` (отдельное приложение/ключ AppMetrica). Без него собственная remote-отправка отключена, последние 128 продуктовых событий доступны в добровольной выгрузке диагностики. Preview CI читает одноимённый GitHub Actions secret; production key в preview не передаётся.

Release требует `APPMETRICA_API_KEY` в формате UUID, а также три `YANDEX_*_AD_UNIT_ID`. Проверка формата не доказывает принадлежность ключа/блоков или доставку событий. Android SDK analytics 8.6.0 закреплён явно; location и advertising identifiers tracking собственного контура выключены. Декларация данных должна учитывать и рекламный SDK.

Обновление 0.30→0.31 читает прежний журнал, а следующая принятая запись уплотняет завершённые операции. Обратный откат к старому APK после миграции не поддерживается; не удаляйте приложение ради обновления. [Протокол](qa/REWARDS_ANALYTICS_0.31_2026-11-02.md).


### Preview 0.40: совместимость обновления
Выданный APK собран PR-run `41811031499`, artifact `13312588228`, versionCode 40. Подпись соответствует 0.39: SHA-256 сертификата `e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13`. Push-run с тем же production-кодом дал иной сертификат и был отклонён: брать произвольный artifact по названию недостаточно. Перед каждой выдачей проверять сертификат и байты production-файлов; не предлагать удаление установленной игры для обхода несовместимой подписи. Подробности: [QA 0.40](qa/FEEL_0.40_2026-11-04.md).


### Preview 0.47: восстановленная объединённая сборка

Исходники `561e8c7`, PR CI `42380128190`, artifact `13576739624`. VersionCode 47, versionName `0.47.0-preview`, applicationId `com.danilah.blocky.dev`. Проверены 220 unit, 146 browser, production build, assets:check и Android unit/build. APK v2-подпись совместима с выданной 0.46; все 78 production-файлов совпали с dist. SHA-256 APK `422fdb0db4a1337885d3dca4e9e4f0f8d4d1a30c6d29dc16722f190d7e2b62e9`. Физическая установка/ощущения/реальный SDK по-прежнему требуют устройства. [Итоговый протокол](qa/RECOVERED_0.47_2026-11-07.md).


### Preview 0.48: исправления по реальному плейтесту

Исходники `ca2e9e1`, PR CI `42392425206`, artifact `13581533873`. VersionCode 48, versionName `0.48.0-preview`. 220 unit, 148 browser, Android unit/build — success. Проверены v2-подпись и 78 production-файлов; сертификат совпадает с выданной 0.47. APK SHA-256 `f7d079918cd345e6eb3a926db44b283f5c1814ac833f0f19d04678f728fb1de5`. В preview доступна ручная запись плавности в «Пауза → Ещё настройки → Диагностика». [Протокол и оставшиеся задачи](qa/PLAYTEST_0.47_AND_FIXES_0.48_2026-11-07.md).

Preview 0.49: отдельная страница автозамера очистки, около 70 секунд; 7 условий × 2 прохода плюс warmup, JSON через существующий native share. Исходная партия не записывается/не заменяется. Экспериментальная подсветка доступна только в автозамере; обычный рендер и flow-v4 прежние. Усиленный финальный отклик включён. CI 42402230905: 220 unit, 170 browser, Android unit/build — success. APK versionCode 49, прежний signer 0.48; все 86 production-файлов совпали. Лаг не объявлен исправленным. [Протокол](qa/LAG_DIAGNOSTICS_0.49_2026-11-07.md).


### Preview 0.50: точные позиции реальной очистки

Исходники `59bce5c`, PR CI `42406979366`, artifact `13587927671`. VersionCode 50, versionName 0.50.0-preview. 221 unit, 172 browser, Android unit/build — success. V2-подпись совместима с выданной 0.49; все 86 production-файлов совпали. APK SHA-256 `7b7812eca4376e51b25d6a644ac42545748fee59fed149d7026e227b346c38ba`. Исправлена смена фоновой темы в автозамере; обычная диагностика schema 4 включает позицию, ход и оформление полной очистки. Обычный рендер и flow-v4 сохранены, лаг не объявлен исправленным. Физическая установка и новый реальный замер остаются открытыми. [Разбор и инструкция](qa/PHONE_BENCHMARK_0.49_2026-11-08.md).


### Preview 0.51: частичная оптимизация полной очистки

Исходники `d78ac8c`, PR CI `42451698323`, artifact `13606321935`. VersionCode 51, versionName 0.51.0-preview. 221 unit, 181 browser, Android unit/build — success. V2-подпись совместима с выданной 0.50; все 86 production-файлов совпали. APK SHA-256 `47953355d8b79f122c8f5715e370b627d616706d0942f06ab64f13f0ae3b709a`. Classic/WebGL использует кеш рамки и flat-color заливку; игровые правила/разрешение/эффекты сохранены. Стендовые gates пройдены, ускорение на POCO ещё не подтверждено. [Протокол и данные](qa/PHONE_CLEAR_0.50_2026-11-08.md).


### Preview0.52: диагностика без USB

Исходники `362f9531c244a41cd14d7f8d09bfa8c12aa8cf70`, PR CI `42460033472`, artifact `13609328963`. VersionCode52, versionName0.52.0-preview, debug APK, прежний package. 221unit/186browser/Androidunit+build — success. V2-подпись совпадает с выданной0.51; все89 production-файлов совпали с чистым dist. APK SHA-256 `99e657f24d653b7190b480c537ae74e7849eb8c3e2c5a6a283f09502f4036896`. Обновлять поверх установленной игры. Пауза → Ещё настройки → Диагностика → Проверить очистку: короткий реальный игровой прогон и ZIP с WebView-трассой, без USB. Android tracing API28+/debug. Физический запуск и причина лага ещё не проверены. [Протокол](qa/PHONE_TRACE_0.52_2026-11-08.md).
