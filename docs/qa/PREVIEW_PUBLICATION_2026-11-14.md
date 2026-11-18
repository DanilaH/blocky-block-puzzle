# D89 — подписанная тестовая APK0.64

14.11.2026. APK0.64.0-preview собрана в прежнем PR1, с прежней подписью,
тестовой Yandex-рекламой и выключенной AppMetrica. Основной director-v2;
composition-v1 — единственный отдельный ручной кандидат, rollout OFF.
[Инструкция плейтеста](PLAYTEST_0.64_RU.txt).

## Публикация и исходники

Владелец разрешил публикацию, затем исключение для подключённого GitHub API
после ошибки git push `could not read Username`. Новый credential/доступ не
создавался. Одним create_tree отправлены159 целых UTF-8 файлов поверхc31a49e;
blob API, ручное base64 и force не использованы. Полученный tree совпал с
локально рассчитанным: da469c11261e82db1a0e421c6aff176ca66fa101.

Source commitca1e4a1b5e90e4531a282a32ebde2a951ea01864 имеет родителей8894c8a
иc31a49e, сохраняя обе прежние истории. Ветки work/blocky-commercial-iteration-
2026-11-13 иfeat/classic-preview обновлены, preview — fast-forward c expected
head8894c8a. Main не менялся. Весь runtime/native/tests/e2e/scripts/settings
независимо сверен с полной локальной веткой5a370c9. Только9 новых gzip/крупных
generated QA files оставлены в проверенном D88 bundle; игровой код сохранён.
Исходные записи владельца, ключи, APK и credentials в Git не добавлены.

## Дистрибутив и независимая проверка

[PR Actions43492083673](https://github.com/DanilaH/blocky-block-puzzle/actions/runs/43492083673),
Android job132115588003: исходный signer cache hit, unit/assemble/подпись PASS.
APK artifact14070266474 иproof14070501341 скачаны; SHA256 обоих ZIP совпали с
GitHub digests. После скачивания независимо проверены:

- Package com.danilah.blocky.dev, versionCode64, versionName0.64.0-preview.
- APK11788980 bytes, SHA256
  eb0adbff6cd1161cd927dd6fffd20909ba43dd6b6f66dac732ba660d0f7a7529.
- apksigner v2 PASS; cert SHA256
  e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13.
  Сертификат тот же, что в0.63; это не подменный debug key.
- Все99 production web files внутри APK совпали по размерам/SHA256 с CI proof.
- Merge checkout3316a25fb810af9c7dac7bf7ea2e80375f997429 имеет source tree,
  совпадающий с опубликованным и ожидаемым.
- aapt2: AppMetrica key пустой, ads_test_mode=true, все live ad IDs пусты.
  Native key-empty path пропускает activation и выключает data sending.

Проверки:

- 332 unit /53 файла,5 Python коммерческих метрик, web build/assets и прежние
  analyzer suites PASS в CI.
- Android unit/assemble/подпись PASS;21 native unit также независимо пройдены
  локально на полном Android toolchain.
- 25 focused-effects browser PASS.
- Android-эмулятор:2 instrumentation tests PASS. Скрипт отключает сеть;
  это не проверка реального рекламного показа и не физический телефон.
- Полная browser-регрессия:243 PASS,1 FAIL из244 за20.5мин.
  Единственное падение — старый e2e/rewards.spec.ts без ожидания принятия
  первого хода перед вторым в повторно загруженной fixture.
- Гонка независимо воспроизведена локально:2 падения/5 повторов. После
  добавления ожидания подтверждённого счётчика moves и снятия aria-busy:
  10/10 повторов и весь затронутый файл4/4 PASS. Эффекты не ожидаются;
  тест по-прежнему проверяет ввод во время праздника и точный счёт127.
- Полный набор244 после изменения только теста повторно не запускался.
  Игровые/native/assets/package файлы побайтно те же, что у подписанной APK.
  Глобально зелёный CI не заявляется: исходный run зафиксировал один FAIL.

Доказательства: checks-summary.json, CI APK proof, независимая проверка
99 файлов/подписи/ресурсов и локальные before/after logs в
preview-publication-2026-11-14/.

Отдельный автоматический push-run43492073089 остановился на проверке подписи
его cache. APK взята из PR1, где восстановлен правильный signer и сертификат
совпал. Проверку не ослабляли, новый ключ не создавали. Это отдельная проблема
области CI cache; не распространять неподходящий APK из другой области.

## Что ещё требует устройства или кабинета

Физический телефон: реальный demo show/reward/return, обновление старых
сохранений, длинная сессия/лаг и человеческий баланс v2/composition-v1.
Эмулятор/Chromium не доказывают плавность телефона. Прежний desktop soak
не установил причину пользовательского лага.

AppMetrica cabinet/export/actual ILRD delivery отложены владельцем. В этой
сборке нет отправки AppMetrica; monetary/retention outcome не заявляется.
Кандидат не становится основным по автопроверкам. Cap/второй revive/ML не добавлены.
