# Проверка mini-games-kit — 23.10.2026

Просмотрены README, AGENTS, API index и исходники следующих примитивов.
Основной revision: `DanilaH/mini-games-kit@5450f9db344aacb5acdc103b4199fd8aeb11b10d`.
Дополнительно прочитаны ADS_AND_LIFECYCLE, DURABLE_RECEIPT_QUEUE и исходник очереди из `extract/seeds-production-practices@d4dee18c9b466e2b4a68d8d481db6dfc50ec9ee5`. Эта ветка на момент проверки ещё не в main.

| Решение kit | Применение |
|---|---|
| GameplayActivityCoordinator | Исходник перенесён без логических изменений (применено форматирование) в src/vendor/mini-games-kit/activity.ts. Раздельные причины dialog/visibility/blur/native/WebGL; одно событие не отменяет чужую блокировку. |
| RevisionSnapshotQueue | Не подключена: здесь каждый принятый ход обязан ждать фиксации. Один ProfileStore координирует операции, IndexedDB транзакция пишет current + backup. Нет второго писателя наград. |
| pickWeighted / RandomSource | Принцип применён, MathRandomSource не используется. Собственный xorshift32 с векторами; веса ориентаций суммируются в вес семейства. |
| native banner placement | Контракт принят для будущего нативного адаптера. В прототипе только DOM reservation, нативного объявления нет. Не выдавать reservation за интеграцию. |
| DurableReceiptQueue | Прочитан контракт, отложено подключение до реального нативного producer. Нельзя получать награду по закрытию рекламы или ack до фиксации эффекта. |
| Yandex Games bootstrap / YandexAdsAdapter | Не применимы: текущая цель Android/RuStore, не Yandex Games. Не подключать веб-SDK в WebView. |
| PresentationAudioMixer / visual assets | Не копировались: у этого прототипа короткие синтезированные одноразовые SFX, нет фонового аудиосостояния. Полный звуковой набор остаётся в M1/M3. |

Не добавлена зависимость на весь экспериментальный пакет ради одного файла. Происхождение vendored-файла явно закреплено здесь; обновления только после review. LICENSE-NOTICE kit: «Internal/private reusable production kit. No external publication or licensing commitment is implied by this repository.» Копия используется во втором проекте того же владельца, общей лицензии третьим лицам не заявляем.

Нативные production-практики из судоку/семечек прочитаны, но их APK-результаты не являются доказательством работоспособности Blocky. Реклама, audio focus, измеренная высота баннера, долговечные native reward receipts и AppMetrica ещё не реализованы.
