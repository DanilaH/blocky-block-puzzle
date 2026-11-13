# D88 — игровой preview без AppMetrica

13.11.2026. Поверх D87/19c61e8, исходники0.64.0-preview. Владелец явно
отложил AppMetrica и запросил игровой тест. Новая выдача остаётся отдельным
кандидатом, основной director-v2, rollout выключен.

## Изменение

Debug и CI по умолчанию используют `BLOCKY_PREVIEW_ANALYTICS=off`.
Пустой AppMetrica key пропускает активацию SDK и вызывает
`AppMetrica.setDataSendingEnabled(false)`, включая другие сохранённые reporters.
Локальные capture/диагностика сохраняются. Yandex ads_test_mode=true и demo
units. Production key никогда не подставляется в debug.

`build-preview.py --analytics test` или прямой Gradle с
`BLOCKY_PREVIEW_ANALYTICS=test` оставляет прежние проверки отдельного test key.
Release по-прежнему требует production key и собственные ad units.
CI требует прежний cached signer и прекращает сборку при его отсутствии.

## Реальная проверка окружения

Отсутствие установленного toolchain было преждевременно представлено как
внешний блокер. В этой итерации установлены:

- Android platform36_r02: metadata SHA1
  `2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576`.
- Android build-tools36.0.0: metadata SHA1
  `b0b6376977657e8ad9b969bacf4093601da2c6fb`.
- Platform-tools37.0.3: metadata SHA1
  `e1579b288a7ae4e9bc28dedec6a154d78b3c04ed`.
- Eclipse Temurin JDK21.0.13+9: official release SHA256
  `d7f5d5cf865a2902b70ff549b97586a7d3f234e016f041ab447ea740c7d66d1c`.
- Wrapper-pinned Gradle8.14.3, SHA256 из репозитория проверен.

Java использует текущий inherited HTTPS proxy и доверенный CA среды; TLS
проверка не отключалась. Устаревший GRADLE_OPTS browser-proxy был заменён в
сборочном процессе настройками текущего HTTPS_PROXY. AGP дополнительно
установил свой build-tools35.0.0; compile/target SDK остаются36.

## Проверено

- 332 unit /53 файла PASS и production web build PASS.
- `:app:compileDebugJavaWithJavac` PASS со всем native ads/analytics/ILRD bridge.
- `:app:testDebugUnitTest`: 21 тест, 0 failures/errors, 5 suites PASS.
- Generated debug resources: appmetrica_api_key пустой, ads_test_mode=true.
- Полная unsigned `:app:assembleDebug` PASS с локальным init script,
  отключающим debug signing без создания другого ключа. APK11784816 bytes,
  SHA256 `49eaff0afd7c930ee7b36d4f3b113869b639400430b3ad7cc8510b9eeceb0fd4`.
  Manifest package/version/code совпали; все99 dist-файлов побайтно совпали;
  aapt2 подтвердил пустой AppMetrica key и ads_test_mode=true уже внутри APK.
  apksigner ожидаемо отклонил unsigned APK. Это не устанавливаемая поставка.
- Actual Gradle packaging task graph: off без key проходит; test без key
  останавливается с ожидаемой ошибкой. --check с установленным toolchain
  сообщает только об отсутствии оригинального keystore локально.
- В старом успешном Actions run42845500290, Android job129947035051, проверены
  cache hit `blocky-preview-debug-keystore-v1` и APK0.63 certificate SHA256
  `e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13`.
  Это подтверждает прежний способ сборки; не доказывает новый cache restore.
- Локально полный поиск не нашёл оригинального keystore; `gh auth status`
  сообщает об отсутствии CLI-аутентификации. GitHub app имеет push/admin
  permission на публичный DanilaH/blocky-block-puzzle, но shell credential
  из этого не следует. Метаданные репозитория проверены через подключённый app.

## Открыто

Новая подписанная APK не получена. Нельзя подписать её новым ключом и выдавать
за совместимое обновление. Нужен запуск текущих исходников в Actions с
оригинальным cache signer либо сам исходный signer в сборочной среде.
Прямая отправка обычным Git готовой ветки
`work/blocky-commercial-iteration-2026-11-13` отклонена автоматической проверкой:
публикация исходников в публичный GitHub признана внешним изменением без
явного разрешения владельца. Push/новый CI не состоялись; повторного обхода
через API, кодирование или другую передачу не предпринималось.
Проверки физического телефона, тестового показа/возврата из рекламы и
человеческого сравнения остаются открытыми. AppMetrica cabinet/delivery
отложены владельцем и больше не являются условием игрового плейтеста.

Исходные игровые записи и ключи не добавляются в Git. AGENTS по прямому
требованию владельца разрешает для синхронизации обычный Git, запрещая blob
API/base64/перенос кусками. При недоступном Git сохраняется цельный bundle.
