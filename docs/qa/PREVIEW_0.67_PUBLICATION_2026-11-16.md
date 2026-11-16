# Preview0.67: подписанная APK для телефонной пробы

Владелец явно разрешил публикацию исправления и Actions16.11 после отказа
auto-review15.11. Работа только в Blocky. База public0c4e468/D92; main не
использован. Ordinary Git credential недоступен (подтверждено dry-run:
could not read Username, terminal prompts disabled); разрешённый whole UTF-8
tree путь через подключённый GitHub, без blob API/base64/разрезания файлов.
Записи пользователя/ключи/APK не коммитились, mini-games-kit не изменялся.

Source commit86daf152453a58e5ff653ae80565606fa16f2b78, tree
1e32e331b7062774f1033a39e56b829ad5ba0e59. PR1 checkout/source marker
c9393a1575eaf69fc7f3d515fcbfbb64f7eedbb1 имеет то же дерево. Preview/source
ветка frozen на86daf152; последующие документы — только fix/work branches.
[Сама правка и границы измерений](ALL_CLEAR_RING_0.67_2026-11-16.md).

## Проверенный файл

Package com.danilah.blocky.dev,versionCode67,0.67.0-preview.
APK11791100bytes,SHA256
`d528da09a687dd307b04c0efd96502173eccae6f554549ee859ee25fa6e753b2`.
Прежний signer SHA256
`e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13`.
Устанавливать поверх preview, не удалять прежнюю игру.

[Запасной APK в ZIP](https://github.com/DanilaH/blocky-block-puzzle/actions/runs/43815781553/artifacts/14202457368):
GitHub login,распаковать app-debug.apk. ZIP11090742bytes,SHA256
`384a8347b615bff8f73954d1fd4eea3a278932fb8c4ae0eb2c0dd7d087215a1e`.
Сам APK,ZIP и короткая инструкция отдельно сохранены владельцу; основной
канал — прямое скачивание APK в чате, не только GitHub ZIP.

APK/proof artifacts14202457368/14202188633 получены из PR1 run43815781553.
ZIP digest обоих независимо совпал с GitHub. Официальный SDK36 archive
проверен по checksum из Google repository metadata; независимый apksigner
подтвердил v2 signature и старый cert. Manifest67/0.67,все99 dist файлов
побайтно совпали с локальным build с тем же source marker; полный JSON proof
побайтно по содержимому равен CI. [Proof](all-clear-ring-2026-11-16/APK_PROOF.json).
AAPT2: ads_test_mode=true,appmetrica_api_key и все3 yandex_*_id пусты.
Тестовая реклама/аналитика off подтверждены упаковкой, не реальным SDK show.

## Статус проверок на момент выдачи

- Local339 unit(2 workers),6 восстановленных ring browser,build/assets PASS.
- PR1 Android job133127381322: unit/assemble/signature/packaging PASS.
- Focused-effects job133127381263:31 browser PASS (3.3мин).
- Emulator job133128343353:2 instrumentation tests PASS; API35 Pixel6 profile,
  SwiftShader. Это эмулятор, не физический телефон.
- Полный verify job133127380899 ещё in_progress в test:e2e. Пока не заявляем
  PASS всему workflow/261 browser. [Живой CI](https://github.com/DanilaH/blocky-block-puzzle/actions/runs/43815781553).

Нужен телефон: update/resume и2 полные очистки с обычным звуком/вибрацией,
сначала без записи экрана. Проверить исчезновение растягивающегося кольца и
оценить оставшийся рывок. Новая длинная запись не требуется. Phone speedup
не установлен. AppMetrica кабинет отложен, баланс D91 HOLD/default v2/OFF.
