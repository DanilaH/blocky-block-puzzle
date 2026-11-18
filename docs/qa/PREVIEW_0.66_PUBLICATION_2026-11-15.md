# Preview0.66 / D92 —15.11.2026

Одна сравнительная версия по конкретному task mini-games-kit3f0c01d.
Source477e691e1fb971c89a78b8e97466a5b72a4d1577, CI merge
44095e928591efde227573a6ac1036913152a4d8; одинаковое дерево
7fd626d1396079214fcdc3878f33593f7d0fedc8. Локальный aa3e4ce соответствует
ему. Старый main не использовался. Обычный Git dry-run подтвердил отсутствие
CLI credential; применён разрешённый ранее connected GitHub whole UTF-8 tree
путь, без blob/base64/разрезания файлов. Ни ключей, ни APK, ни исходных
личных записей в Git нет. Consumer-изменения только в Blocky.

## Файл

Package com.danilah.blocky.dev,versionCode66,0.66.0-preview.
Размер11791048 bytes; SHA256
`58736ba328ed136d812189b44bea380ef927dbf1a385c5c6e4b8ae4d630ec426`.
Прежний signer
`e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13`.

[Скачать APK в ZIP с GitHub](https://github.com/DanilaH/blocky-block-puzzle/actions/runs/43738640302/artifacts/14171960076).
Открыть под GitHub-аккаунтом владельца, распаковать app-debug.apk,
установить поверх preview. Этот канал дан из-за предыдущей проблемы
скачивания на телефоне через чат; успешное скачивание самим телефоном пока
не наблюдалось. APK/ZIP/инструкция также сохранены владельцу отдельно.

Artifact14171960076, ZIP11090684 bytes,SHA256
`1515990a4d5f7e1021579a1ce25dbf7f42704541e2b66b5f40d11fe573ce108c`.
Proof14170969389,ZIP SHA256
`a1a6cdd86863e3cc652491d37c420011c16fcda0384576719177964fc9456153`.
Оба скачанных архива сверены с Actions digest до распаковки.

Официальные build-tools36 скачаны с проверкой repository metadata checksum.
Независимый apksigner подтверждает v2 signature/original cert. Повторный
production build с VITE_SOURCE_COMMIT=CI merge совпал со всеми99 файлами
APK; локальный JSON proof полностью равен CI. AAPT2: ads_test_mode=true,
appmetrica_api_key и live units пусты. Это demo/off, не delivery кабинета.
[Полный proof](floating-performance-2026-11-15/apk-proof.json).

## Проверки

[PR1 run43738640302](https://github.com/DanilaH/blocky-block-puzzle/actions/runs/43738640302).

-339 unit/TypeScript/build PASS.
-20 targeted browser PASS локально; baseline ожидаемо не проходит hidden
  ownership regression, candidate проходит. Не смешивать этот expected FAIL
  с результатом новой версии.
-25 focused effects job132886725355 PASS.
-Android unit/assemble/signature job132886725395 PASS.
-2 emulator instrumentation job132887524937 PASS. Это эмулятор, не телефон.
-255 общих browser в job132886725143 PASS (24.6мин);339 unit PASS.
  Все4 jobs PR1 завершились success.
-6 matched pairs/2 trace/1 cancel для praise: exact after hash совпадает,
  результат смешанный. Это инженерное измерение, не Android FPS.

[Реализация, измерение и границы](FLOATING_PERFORMANCE_0.66_2026-11-15.md).

Телефон остаётся: update/resume, быстрый новый drag во время возврата,
небольшой привычный эпизод с замером плавности. Нужен конкретный симптом,
чтобы продолжать поиск physical lag, а не новый общий renderer audit.
Баланс/старые версии/награды/реклама прежние; composition-v2 HOLD/default v2/
audience OFF. AppMetrica кабинет отложен владельцем.
