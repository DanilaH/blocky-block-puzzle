# D92 / завершённая переносимая фигура — preview0.66

15.11.2026. Основа — свежие ветки Blocky f02a8c6, не scaffold main.
Задание: [BLOCKY_NEXT_TASK.md](https://github.com/DanilaH/mini-games-kit/blob/3f0c01d4a799efb73c29aaa530c6b18c74ce7004/research/games/block-puzzles/2026-11-15-visual-performance/BLOCKY_NEXT_TASK.md).

## Что было конкретно в задании

Первый пункт — воспроизведённый дефект с точным lifecycle и критериями.
Второй — диагностическая развилка, без выбранного телефонного эпизода/лога.
Поэтому выполнена одна ограниченная инженерная проверка praise.worker на
ordinary-line episode; причиной физического лага он не объявлен. Другие
ветки save/idle/renderer/ledger в новый широкий аудит не раздувались.

## Исправление

`releaseFloating` завершает владельца overlay: сначала меняет generation,
отменяет собственные root/child WAAPI, освобождает DOM, скрывает контейнер.
Его вызывают завершённый тап, успешный drag, отмена и завершение возврата.
Отвергнутая постановка сохраняет изображение до конца150мс возврата.
Поздние finish/cancel старого возврата не скрывают новый drag: token уже иной.
Новая фигура по-прежнему получает material sync до hidden=false; общего
skipHidden, MutationObserver и нового renderer/quality manager нет.

На отдельной неизменённой baseline f02a8c6 тот же census:36 hidden starts
при двух material changes,44 starts вне floating,1 retained child wrapper.
После исправления0 hidden starts, те же44 снаружи,0 children/owned animations.
Это исчезновение лишней работы, не36 «сэкономленных кадров» и не процент FPS.
[Счётчики](floating-performance-2026-11-15/ownership-census.json).

В opt-in performance capture добавлены фиксированные bounded имена:
`praiseWorkerStart`, `praiseWorkerResultWallTime`, `praiseWorkerCancelWallTime`,
`praiseWorkerErrorWallTime`. Начало/результат/отмена привязаны к реальному
владельцу worker; старые callbacks не считают завершение нового job.
Wall lifetime включает загрузку/очередь/обмен, не выдаётся за CPU.
Schema4/rings/лимиты сохранены. В обычной игре capture выключен.

## Один эпизод, один проверяемый источник

[Протокол до измерений](floating-performance-2026-11-15/PROTOCOL.md).
Synthetic ordinary clear, заполненное поле:после хода28 клеток,13 501 очко,
одна линия, hash c97addcb. Все14 запусков и отдельный cancel probe совпали
по авторитетному GameState. Praise для текущего хода отсутствует в обеих
ветках; исследуется только следующий фоновый ranking, пока идут те же FX.

A — существующие180мс/350мс/3млн checks. B — только ranking запрещён
перехватом source response в test harness. В production нет нового off,
задержки или иного бюджета. Обе ветки уже содержат floating cleanup.
Шесть пар:AB,BA,BA,AB,AB,BA. После durable commit —2000мс ожидания;
общий capture включает также ввод и ожидание записи, поэтому wall-окна
не строго равны2000мс. Отдельная trace-пара не смешивается
с12 untraced. Vite dev/headless Chromium/software renderer, desktop Linux.

|Пара|Порядок|p95 RAF A,мс|p95 RAF B,мс|Интервалы>50мс A/B|
|---|---|---:|---:|---:|
|1|AB|33.3|33.4|3/5|
|2|BA|16.8|16.8|2/3|
|3|BA|33.4|16.8|4/1|
|4|AB|33.3|16.8|1/1|
|5|AB|33.3|16.8|2/1|
|6|BA|33.3|16.8|1/1|

Сумма>33мс34→29,>50мс13→12 при833/816 записанных RAF-интервалах A/B.
Это raw counts, не частота событий в строго одинаковом wall-окне.
B улучшил p95 в4 парах, в одной почти равен,
в одной чуть хуже; длинные интервалы не исчезли. Это ограниченный сигнал,
не установленная причина телефонного лага. Scheduler остаётся прежним.
Worker result wall401–512мс; trace A содержит DedicatedWorker thread,
B — нет. Эти интервалы и наличие потока не подменяются замером его CPU.
Cancel probe:1 start/1 cancel, примерно291мс wall, результат хода прежний.
[Все результаты](floating-performance-2026-11-15/praise-episode.json),
[пары](floating-performance-2026-11-15/praise-summary.json),
[отмена](floating-performance-2026-11-15/praise-cancel.json).

Первая preflight-попытка остановилась до сбора выборки: неверно ожидала
chrome после обычной линии; текущий wardrobe меняется при all-clear.
Исправлен harness, не игра. Все принятые пары имеют одинаковый plastic.
Данные собраны до обновления appVersion с0.65 на0.66, с теми же runtime
правками; version string не меняет игровой результат.

## Техническая проверка

-339 unit/TypeScript/production build PASS.
-18 целевых browser:10 новых ownership/motion сценариев, прежние материалы,
  placement/save/diagnostic export/banner, запрет похвалы fatal move PASS.
  Дополнительно2 multi-touch сценария PASS.
-Обычный accepted tap/drag и calm all-clear: полный GameState равен applyMove,
  сохранённые board/score/RNG/tray/dealer/revive fields совпадают.
-Invalid return до завершения видим; finish cleanup; новый drag и принудительно
  вызванный старый callback; первое material-состояние; cancel/blur/pause;
  system reduced motion и следующий принятый tap проверены.
-В первом расширенном прогоне13/18 во время изменения appVersion dev-сервер
  обновлял модули. Эту методологически невалидную попытку не принимаем как
  результат QA; отдельная причина каждого сбоя не доказана. На свежем
  неизменяемом сервере18/18 PASS, затем2 multitouch PASS.

Исходники core/dealer/save/ads/revive, размеры наград, caps и продуктовый
праздник не менялись. Composition-v2 всё ещё HOLD/manual only, default v2,
rollout OFF. Исходные игровые записи/ключи не публикуются, mini-games-kit
не изменяется этой consumer-правкой.

## Сборка и открытые проверки

Одна preview0.66, versionCode66, прежний signer/package. Demo ads, AppMetrica
OFF по решению владельца. Подписанная APK собрана в PR1 run43738640302. Прежний сертификат, manifest,
все99 файлов независимой повторной web-сборки и demo/off ресурсы проверены.
Android unit/assemble,25 focused effects и2 emulator instrumentation PASS.
Полный255 browser PASS (24.6мин), все4 jobs PR1 зелёные.
[APK proof](floating-performance-2026-11-15/apk-proof.json),
[поставка](PREVIEW_0.66_PUBLICATION_2026-11-15.md). Повторный полный общий soak/renderer-перебор не запускался.
На телефоне остаются настоящий present/frame pacing, update/resume,
быстрый повторный drag после ошибки, короткий привычный проблемный эпизод.
Требуется совпадающий эпизод, чтобы выбрать следующий источник исправления;
не утверждать, что скрытая DOM-работа была причиной физического лага.
