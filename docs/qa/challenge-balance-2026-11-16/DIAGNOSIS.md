# D96: изменения выдачи до подтверждения задачи

База7c80782, установленная0.70 не менялась. Ветка work/challenge-balance-20261116. Seen8105xxx engineering, не holdout.

64 запуска:32 исходные R3 траектории (clear/lapse×8 seeds×tasks/full) и32 диагностических restore-miss. Все32 исходные конечные hashes/moves/all-clear точно совпали с сохранённым R3. Оригиналы владельца в диагностике не использованы.

В исходных32 партиях найдено202 actual hand/RNG/controller расхождения с настоящим v2 на том же поле. Из них176 (87.1%) имеют selected=false;164 (81.2%) не получили финального CHAIN/CHOICE. В26 из32 партий первая физическая разница появилась без selected. Счётчик changedHand не замечал большинство таких замен: он сравнивал с incumbent уже изменённого beam, а не с контрольным v2.

Источник: focus меняет dedup key, retention родителей и scoring ДО принятия task. Даже при target miss/UNKNOWN остаётся первый путь нового beam. Quality band/число очисток сравнивались с этим новым frontier, а не с фактическим контрольным hand. В30 changed positions уменьшилось число witnessed обычных линий; в одном — witnessed full clears. Есть и дополнительные подарки: seed8105004/clear/39 и8105006/clear/39 дают2 witnessed full-clear против1 уv2, хотя task=ORDINARY иselected=false.

| Seen style/factor | Исходный R3 | Restore-miss | Контроль |
|---|---:|---:|---:|
| clear/tasks, награды на ход |37/808 =4.58%|118/1492 =7.91%|120/1600 =7.50%|
| lapse/tasks, capped mean |137.00|142.75|105.88|
| clear/full, награды на ход |83/1390 =5.97%|78/1321 =5.90%|141/1852 =7.61%|
| lapse/full, capped mean |166.13|165.25|158.13|

Restore-miss исправляет clear/tasks reward-rate на этих видимых данных, но НЕ исправляет lapse tail. Это причинная локализация конкретной нежелательной ветки, не доказательство новой production-policy и не принятие баланса. Нельзя просто добавить ещё помощь или подогнать вероятность проигрыша.

Следующая одна структурная правка: завершать исходный поиск v2, сохранять его actual incumbent и принимать только дополнительный доказанный task с защитой его линий и награды; промах возвращает контрольный hand/RNG/controller без побочных замен. Фазовые числа/каталог/ранние12/rest/recovery3 прежние. Новая версия policy,0.70 заморожена. Все дополнительные проверки используют оставшийся общий24000 work; новый глобальный director не нужен. После реализации — новые dev8107xxx, не повторная приёмка8105xxx; numeric gates не меняются.

Код воспроизведения: scripts/challenge-content/diagnose.mjs; raw synthetic contexts толькоartifacts/challenge-balance. Guidancee528149, runtime5450f9d, kitNONE.
