# Журнал наград и продуктовые события — preview 0.31

## Изменения

- Старые полные reward intents читаются без потерь. При следующей успешной записи applied hints, claimed revives и уже продолженные applied revives превращаются в небольшие маркеры без snapshot/plan. `ads.ledgerVersion=2`; запись и предыдущая копия по-прежнему атомарны. Формат не предназначен для отката к APK 0.30 после миграции.
- Pending операции и available revive сохраняются полностью, без TTL. Идентификаторы intents/receipts не удаляются: новая квитанция к старому intent не выдаёт вторую награду. Малые маркеры всё ещё растут линейно; это уменьшение объёма и стоимости валидации, не безграничный журнал постоянного размера.
- Исправлен повторный перевод уже сыгранного revive в available после нового поражения. Если игрок уходит из партии сразу после применения revive, до следующего хода, неиспользованное право архивируется и остаётся доступным.
- Продуктовые события формируются после принятой записи, а не по render/анимациям. Неполная длительность старых партий помечается `durationComplete=false`. Active time не включает паузу/фон/рекламу; сохраняется на принятых транзакциях, поэтому незаписанный хвост перед kill может потеряться.

## События и доставка

`first_open`, `tutorial_start/step/complete/skip`, `game_start/resume/end`, `clear`, `hint_request/applied/shown/fail`, `revive_applied`, `reward_applied`, `save_failure/recovered`, `audio_setting`, `intensity_setting`.

- game_start — первый принятый ход; открытие пустого поля не старт. game_resume — первый возврат к уже начатой партии в данной JS-сессии. game_end — переход в поражение или явная замена начатой партии; продолжение после revive может закончиться новым game_end с другим revision.
- Native SDK: `ad_request/loaded/load_error/shown/impression/clicked/closed/show_error/reward_earned`; отдельно JS `ad_opportunity/unavailable`. Первые native события буферизуются до initialize (не более 64). Rewarded callback и durable reward_applied — разные этапы. События показа не заменяют SDK reward callback.
- Общие eventId/sessionId/appVersion/eventSchema, gameId для игровых действий, intentId для rewarded. Game ID случайный локальный ID партии, не пользовательский профиль. Поле, RNG, сохранения, ad unit IDs и ключи не отправляются.
- JS: история и очередь по 128 событий, последовательные пакеты по 32, отправка через таймер с паузой 1 секунду. Native хранит до 512 ID уже переданных событий, чтобы retry пакета не дублировал принятые элементы.
- Это best-effort аналитика: kill между durable gameplay commit и событием может потерять событие; offline overflow теряет старые записи. AppMetrica reportEvent подтверждает приём SDK, не доставку в кабинет. Exactly-once network delivery не заявлена. Защита игровых наград независима и остаётся durable.
- Последние события включены в добровольную выгрузку диагностики из паузы. Отладочный JS-доступ только в DEV. Нет отправки каждого перемещения пальца или каждого обычного хода.

## Android / конфигурация

AppMetrica Android `8.6.0`, явная зависимость и Application initialization. `withLocationTracking(false)` и `withAdvIdentifiersTracking(false)` для собственного контура. Эти настройки не являются заявлением об отсутствии телеметрии рекламного SDK.

- Debug читает только `APPMETRICA_TEST_API_KEY`; по умолчанию собственного remote analytics нет. Нельзя использовать production key для preview и считать флаг события изоляцией аудитории.
- Release требует UUID `APPMETRICA_API_KEY`, дополнительно к трём рекламным ID. CI preview передаёт отдельный test secret, если владелец его настроил. Значения не печатаются.
- Реальная доставка в кабинет, native callbacks и итоговые disclosures требуют отдельной проверки на устройстве с собственным ключом. Финансовый ILRD-контур не реализован; ad_impression здесь не сумма выручки и не финансовый ledger.

Официальные источники проверены 02.11.2026: [интеграция SDK](https://appmetrica.yandex.com/docs/en/sdk/android/analytics/quick-start), [конфигурация и custom events](https://appmetrica.yandex.com/docs/en/sdk/android/analytics/android-operations).

## Проверки

- Unit: компактный журнал из 1000 завершённых hints меньше 40% исходного JSON, при сохранении pending/receipt IDs и дедупликации. Проверены поздний revive, повторная квитанция, rollback записи, повтор использования и архивирование несыгранного права.
- Аналитика: отказ записи не создаёт game_start/reward_applied; повторные callbacks, меню и reload не создают дубли; активная длительность, restart reason, bounded retry и нефатальные ошибки observer проверены.
- Browser: настоящие нажатия/ход/подсказка/настройки/reload, миграция при настройке и последующее чтение компактного журнала прошли. Существующие ads/recovery сценарии также прошли локально.
- 107 unit прошли локально; build/assets check прошли.
- Web payload из поставленного APK 0.30 → production dist 0.31 на том же origin: профиль точь-в-точь сохраняется при загрузке; после настройки applied marker уплотнён, pending и receipt IDs неизменны, reload успешен. [Протокол](rewards-analytics-0.31/upgrade-030-031.json). Нативный установщик не тестировался.
- Полный CI и проверка APK — результаты будут добавлены после завершения.

Физический Android, живые показы, кабинет AppMetrica и субъективный feel не проверялись. Изменений визуала, звуков и бюджета эффектов нет.
