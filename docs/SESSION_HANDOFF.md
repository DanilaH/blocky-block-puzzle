# Точка продолжения — D100 / поставка0.72, 17.11.2026

Работа завершена на work/selected-v2-default-20261117, от21657057 (не main, не устаревшая локальная7c80782). Владелец выбрал и разрешил закрепить «Задачи и старты · v2» основным:director-challenge-v2/challenge-content-v2/full. Дальнейший тюнинг директора остановлен. Выбор владельца не отменяет исторические modelFAIL D96/D97 и не является A/B. Hidden8103/8108/8110 закрыты.

APK source/preview заморожены7b5b95ada88e5330990dd759f2501c5b6cbfb8f5/tree5f324ef19d9c58066549efac094260e0cdaab0c5. PR1 checkout8658504f3082f5233c7ae6204c4bbb1260f79541 с тем жеtree. Последующиеproof/docs толькоwork,preview не двигать. Main/магазин не менялись,PRdraft. Уже разрешены whole UTF-8 tree API+Actions после credential failure обычногоGit; blob/base64/фрагменты не использовать и не просить новое разрешение.

Обычные новые партии — выбранныйv2; старые saves продолжают своюpolicy. Предыдущий manual comparison не подменяет обычную новую партию; исторический вариант выбирается явно в «Другие варианты выдачи». Game/history/manual choice атомарны, включая AdsController.betweenGames; поздняя вторая запись убрана. Initial opening history с новым профилем. Сами algorithms/catalog/RNG/revive/earned recovery/ads/effects прежние. Config A/B OFF, старые assignmentIDs сохранены, сравнениеMode явноdefault/manual.

ПолныйCI44039667836 attempt1 success:401unit/61files,Python5/8/4/7,nativeCDP,280browser(97/93/90 singleworker isolatedshards),50focused,Androidunit/build/signature,2emulatorPASS. Покрытие280 без пропусков/дубликатов проверено. Локально63unique targeted browser/build/assets/public guard,1805original exact+cell movesPASS. Oldsource0.71 fixtures сохраняют5earned hints/partialfree/receipts/revive/settings, продолжаются реальным UI move, duplicate receipt не начисляет повторно; отказ записи/Cancel/retry у живой и завершённой партии.

Предварительныйfull run44033678409:279/280 (староеexpectdefaultdirector-v2). Run44037416486:278/280 (две старые установки в угол послеtutorial/hiddenboot). Tests исправлены без weakening assertions/timeouts; production files после первогоsource6ba5c6a не менялись. Последнийsource7b5b95a включает все исправления, полныйrunзелёный. Первый localunit60workers дал2старых5stimeout,maxWorkers4 прошёл без code/timeout changes. Эти неуспехи раскрыты вpublicationreport.

APK Blocky-0.72.0-preview.apk:11810301bytes,SHA8936930dd28307066ca2e3421202dd9a35139d2be5617ba8d6e130ce2f84fc4c. Packagecom.danilah.blocky.dev/code72,прежний signer e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13. 99productionfiles, manifest/version/source marker/resources/demo-off и полныеCI/localproof byteequal, officialapksigner/aapt2/zipalign16KiB PASS. Ключ локально не создавался, брать только originalActions cache,uninstall не предлагать. APK/ZIP/instruction сохранены владельцу; не брать промежуточные0.72 сsources64416/0acf вместоfinal7b5. ZIP11096113bytes/SHA26aa8f6d192845b9a2c368bad5c4739f4d0927d8e9b33c36a05cefedfc66904c. ВнутриfinalAPK/README/SHA256SUMS,CRC иAPKbytes проверены.

Физическое Android update/resume ещё требует короткогоsmoke поверх0.71 без удаления:стараяпартия,фон/возврат/перезапуск,обычнаяноваяv2безвыбора. Повторный баланс-плейтест не требуется. Phone FPS/тепло/память/liveSDK/кабинет/доход не доказаны;AppMetrica отложена владельцем,demo ads/analyticsOFF. Старые права/сохранения не сбрасывать. Originalrecords4+2 вprivate-inputs,никогданеGit; новыеAPK/keys/screenshots тоже неGit. KIT IMPACT NONE,guidancec7ddb3018c625bc654a58bd846bb77baece32728/runtime5450f9d. Работа толькоBlocky.

[Изменение](qa/SELECTED_V2_DEFAULT_0.72_2026-11-17.md), [точная поставка и проверки](qa/PREVIEW_0.72_PUBLICATION_2026-11-17.md).

## Предыдущая точка D99

# Точка продолжения — D99, 17.11.2026

Ветка work/human-selection-v2-20261117 от6113914, не main. Владелец после сравнения предпочёл «Задачи и старты · v2» (director-challenge-v2/config challenge-content-v2/full). Настройку директора останавливаем; не начинать v4 или повторный плейтест этой пары без нового конкретного дефекта. Это человеческий выбор версии для дальнейшей поставки, не отмена model FAIL D96/D97 или A/B.

Новые два экспорта:685 точных уникальных ходов, независимые клетки/all-clear/game-over PASS. Две сыгранные партии0.70:35/230 ходов, первое поражение26/134; триv2:86/158/176, первое поражение62/140/155. Все5 окончательно завершились после одного revive каждая. Два уникальных пустых старта исключены. Среднее занятых клеток до первого поражения12,73 в0.70 против18,18 вv2; ощущение более свободного поля сходится с этими партиями. Длина до первого поражения80/119 в среднем, не утверждатьv2 всегда короче. Пять3×3/старыйлоток/счёт/witness/recovery/реальных продолжений PASS; всеbaseline-found, не новые alt-zone cases.

Изменены только offline инструменты и docs: CPU repeat analyzer теперь передаёт сохранённое observation.activeMs; новый summary исключает пустые игры/дубликаты, разделяет до поражения/послеrevive. Все685 основных и1370 дополнительных CPU applyMove совпали, не phone benchmark. Original attachments приватны, вGit только анонимные агрегаты. Нового fullsuite/build/CI/Android/APK нет. Production/src/android/public/package/default/rollout прежние. УстановленнаяAPK0.71/source5be1d7b уже содержит выбранный режим. Развёртывание выбранного default отдельным изменением; не путать выбранныйchallenge-v2 со старым defaultdirector-v2.

Phone FPS/нагрев/память и live SDK/доход этимиJSON не доказаны. AppMetrica отложена владельцем,demo/off; holdouts8103/8108/8110 закрыты. Source preview/PR1/main не менять ради docs, права и old saves сохранять. Whole UTF-8 tree API ранее разрешён владельцем после Git credential failure; blob/base64/фрагменты не использовать. Только Blocky,KIT IMPACT NONE.

[Разбор и решение](qa/HUMAN_SELECTION_0.71_2026-11-17.md), [агрегаты](qa/human-selection-071-2026-11-17/selection-summary.json).

## Предыдущая точка D98

# Точка продолжения — D98, 16.11.2026

Ветка work/challenge-start-causality-20261116 от585b38a, не main. Диагностика завершена без production changes. Source preview/APK0.71 остаются5be1d7b, PR1 и main не двигались. Старые политики, сохранения и права прежние. Defaultv2 / аудиторияOFF, demo ads / analyticsOFF, AppMetrica отложена владельцем. KIT IMPACT NONE, guidancefbadc2f / runtime5450f9d.

512 crossed +512 independent-future запусков /184170 ходов, cap300/no revive. Payoff1 у ordinary/authored, sinceLoad1/0; 256 пар счётчика без изменения траекторий, 128 родных D97 outcomes exact. Разница RNG draws35/5 чувствительна к знаку эффекта. Ещё четыре future streams заранее заморожены, анализ усредняет внутри16case clusters: задачи на authored length clear−10,22 / lapse+4,16; interaction clear+0,52 (95%−15,91…17,59), lapse+13,58 (+1,63…27,16). Положительный lapse signal не скрывать; это seen diagnostic, не acceptance/люди/телефон. Общего дефекта и конкретной правки не установлено. Не выпускать v4 и не подбирать runtime offset ради видимых seed.

Пять новых math tests/build/public guard PASS. Все initial/final profiles и whole witnesses проверены, maxwork23488. Полного нового suite/CI/Android/phone нет. Независимый процесс оборвался на448, --resume сохранил строки и завершил64 с теми же условиями; source357fcf2/public9ce06dd. Source freeze первой матрицы aa13a62/public125da1b, анализ7a42d38/public25ee5d4; независимый14beee1/public9197de2, анализa42a2b9/public495eb1d. Trees в каждой паре exact; публикация после исходов, локальные freezes до них.

D97 full остаётся HOLD/content иtailFAIL; эту диагностику не считать пересдачей. Hidden8110xxx/8108xxx/8103xxx не открывались. v3 без меню, новаяAPK не создаётся. Следующий полезный шаг — ручное сравнение уже поставленной0.71 («Задачи и старты · v2») с сохранённой0.70, отдельные встроенные JSON, видео необязательно. Сначала выгрузить и сохранить запись, затем удалять её перед новой. После конкретного эпизода формулировать следующую узкую гипотезу, не перебирать алгоритмы по видимым gates.

Owner archive Blocky-D98-synthetic-QA.zip:1918376bytes/10files/SHA96cc05d28bbd0bb9293c66c79bff51394a3bc07c6e9e64bf4ad86eafa71f30b5. Обе raw synthetic матрицы и D97input сохранены отдельно; вGit только агрегаты. Оригиналы владельца/keys/APK/скриншоты не публиковать. Whole UTF-8 tree API уже разрешён владельцем после credential failure обычногоGit; без повторного разрешения, blob API/base64/фрагментов.

[Полный результат](qa/CHALLENGE_START_CAUSALITY_D98_2026-11-16.md), [протокол](qa/challenge-start-causality-2026-11-16/PROTOCOL.md), [инструкция0.71](qa/PLAYTEST_0.71_RU.txt).

## Предыдущая точка D97

# Точка продолжения — D97,16.11.2026

Ветка work/challenge-opportunity-20261116 отd007815, не main. Source preview/APK0.71 остаются5be1d7b, PR1 не двигался. Рабочие v1/v2/сохранения/права сохранены. Round-robin extra traversal исследован и не включён в игры: больше completed hands, но0 новых задач на37 seen misses. Oracle нашёл50 задач в8contexts, все теряли1–2 линии при том жеfull-clear.

Один semantic-band candidate director-challenge-v3/config challenge-content-v3/authoritative challengeV3State: ≤1 lost ordinary line, ≤8 occupied cells, exact baseline full-clears; вместо scalar band−80. Поиск/каталог/окна/work24000/recovery3/RNG/controller прежние. Старый v2 strict guard не менялся. Freeze local4bc98563518c4a373778c1584d3f5dd32e2344df = public31eb8f3496af42b6ced02be99fb7ffc3d2bcdf6c/treee1b5337. До него diagnostic2273d25 = publiccf0f36f/tree09c2920. Оба checkpoints опубликованы с идентичнымиtrees. Whole UTF-8 tree API уже разрешён владельцем после credential failure Git; без повторного разрешения, blob API/base64/фрагментов.

Dev8109xxx:256партий/45930ходов,44/46guards PASS. Tasks-only passes; **full:content FAIL7,699% при8,153%**, **full/clear:tail FAIL245,5625 против220,9375 (предел243,03125)**. Общий HOLD, UI v3 не добавлен, версия/APK0.71 прежние, следующийAPK по этому провалу не собирать. Holdout8110xxx/старые8108xxx/8103xxx НЕ ОТКРЫВАТЬ, численные guards и алгоритм не подбирать по dev. Не объявлять tasks-only принятой новой продуктовой конфигурацией задним числом.

392unit/59files/build PASS;30focused проверяют band/zero allowance/replay/clock/worker/atomic opening/earned3recovery. Первый unit запуск рядом сlegacy replay/build дал3старых5s timeout, повтор без фоновой нагрузки прошёл без test/timeout changes. Все128R3+256D96=384старые партии exact,1120private user moves exact+cell oracle PASS. Накаждомnewrefill whole witness/admission/actual baseline/RNG/controller guards PASS;oracleUNKNOWN0, fallback0,maxwork23488,p95full18,17мс. Это desktop/core, нового CI/Android/телефона нет.

Следующий причинный вопрос — взаимодействие задач со стартовыми полями и начальным RNG/controller, потому что tasks-only проходит, full не проходит. Не требовать плейтест как блокер этого разбора и не начинать цепочку новых директоров без диагноза/нового freeze. Не менять текущие v1/v2 и не складывать budget-v1 автоматически. Defaultv2/rolloutOFF,demo/off. Guidance33515a3/runtime5450f9d,KIT IMPACT NONE. Ничего не публиковать вmini-games-kit. Public QA толькоагрегаты;raw synthetic/original owner inputs/APK/keys не вGit.

[Полный итог и оставшиеся вопросы](qa/CHALLENGE_OPPORTUNITY_D97_2026-11-16.md),[протокол](qa/challenge-opportunity-2026-11-16/PROTOCOL.md),[диагноз](qa/challenge-opportunity-2026-11-16/DIAGNOSIS.md).

## Предыдущая точка D96

# Точка продолжения — D96, 16.11.2026

Ветка work/challenge-balance-20261116 от опубликованного 7c80782, не main. Причина R3: 176 из 202 фактических замен с настоящим v2 возникали без принятой задачи; restore-miss исправил часть наград, но не длинный хвост. Диагноз aa164e1. Следующий один алгоритм director-challenge-v2 / challenge-content-v2 заморожен до development в 7a5ee756a1d958e2cd1478318b6b6c382cea7bc7. Старый director-challenge-v1 / challenge-content-v1-r3 и authoritative challengeState сохранены; новая версия имеет отдельный challengeV2State. При miss/UNKNOWN возвращается буквальный baseline hand/witness/RNG/controller; доказанная замена сохраняет линии и точное число полных очисток. Общий work 24000, окна/ранние12/rest/earned recovery3 прежние.

256 свежих dev запусков 8107xxx / 43315 ходов, все 8 стартов × rotations0/1. Все технические/наградные/tail guards PASS, но full:content FAIL: 5,33% против 5,13% starts-only при пороге 6,15%; абсолютные задачи 158 против159. Tasks-only content проходит. Общий HOLD/manual, default v2 / rollout OFF. Holdout8108xxx и прежний8103xxx НЕ ОТКРЫВАТЬ; не менять gates и алгоритм по видимому провалу. Новая APK — исследовательское ручное сравнение по заказу, не принятый баланс.

Локально 381unit/17browser/build/assets/public guard, 1120exact+independent legacy moves и все128 прежних R3 games PASS. Новая версия 3600desktop moves: capture OFF/ON final hash одинаковый, capture limit970moves/800078bytes, bounded clock/profile и exact replay. На телефоне это не проверка лагов. UI на320/390 просмотрен. Версия0.71/code71, оба режима в dropdown. Полный CI43900709468 (attempt2) success:381unit/274browser/44focused/Android/2emulator. Первая verify-попытка остановилась на подготовке шрифтов runner, повтор verify без изменения кода прошёл. APK11808929bytes,SHA cdf3d86108cd4ce154772d5bf4b392853feeb0132e7cd35820af823a78ff2ea5,прежний signer/99files/demo-off и полныйCI/local proof совпали.

Git dry-run push вновь отклонён из-за credentials. Whole UTF-8 tree API и Actions уже разрешены владельцем, без повторного согласования, blob API/base64/частей файлов. Все три checkpoints опубликованы с совпадающими trees: diagnosis f857e5a, frozen algorithm 763a321, release5be1d7b. Source preview заморожена на5be1d7b/tree33f0d8f,PR checkout0313b43 с тем же tree и прежним cached signer. Новый ключ не создавать, uninstall не предлагать. Source preview больше не двигать ради docs; proof/docs только work/challenge-balance-20261116 и рабочая ветка продолжения. Для APK proof использовать source5be1d7b/0313b43, не последующее дерево документов. Не складывать budget-v1 и challenge-v2 автоматически. Публичные JSON — только агрегаты. Private inputs и raw synthetic artifacts/APK/keys не коммитить. Guidancee528149, runtime5450f9d, KIT IMPACT NONE. AppMetrica отложена владельцем, demo ads / analytics OFF.

[Итоги и ограничения](qa/CHALLENGE_BALANCE_0.71_2026-11-16.md), [точная поставка](qa/PREVIEW_0.71_PUBLICATION_2026-11-16.md), [протокол](qa/challenge-balance-2026-11-16/PROTOCOL.md), [как сравнить](qa/PLAYTEST_0.71_RU.txt). Следующая работа по балансу — разбор редкого admission (15 замен в64full games), новая гипотеза и новый заранее замороженный dev; не объявлять, что всё упирается только в телефон.

## Предыдущая точка D95

# Точка продолжения — D95 / P1-B,16.11.2026

Новая ветка feat/challenge-content-v1-20261116 от публичногоc729e10/проверенной0.69, не main. Реализованы director-challenge-v1 / challenge-content-v1-r3,8 оригинальных стартов/6 решений/32 вращения, bounded task windows/foreground inputs/replay, atomic anti-repeat. Старые политики и3 earned recovery не менялись. Budget-v1 остаётся отдельным HOLD, не складывать автоматически.

R1 frozen0ceef8d иR2 frozen009e802 отклонены по fresh dev. R3 frozen07f9836:128 новых8105xxx model launches, full9.05% CHAIN/CHOICE противstarts5.76%,4 новыхCHAIN/19CHOICE. Full проходит численные development guards; tasks-only reward/tail не проходит. Общий gateFAIL, holdout8103xxx НЕ ОТКРЫВАТЬ. Никакой дальнейшей подгонки по holdout. Manual/HOLD APK по прямому заказу — техническая исследовательская поставка, не принятие баланса; это разделение записано доR3. Defaultv2/rolloutOFF.

Локально367unit/22browser/build/assets/public-data guard,1120exact+independent legacy moves и7200accepted desktop moves PASS. CaptureON/OFF final hashes совпали, обе bounded records replay;full cap1004moves/798265bytes, игра до1800 продолжилась. ПолныйCI43869146345 завершён success:367unit/270browser/40focused/Android/2emulator. Preview0.70/code70 подписана,11804501bytes,SHA c5c1e02915eb8b905cead0d5819ec681f7020d0a121884f6855d505a2bf8bcfc. Прежний signer/99 production files/demo-off иполныйCI-local proof совпали. Использовать прежний signer изPR1 cache; не генерировать key и не просить uninstall. Demo ads/analyticsOFF,AppMetrica отложена владельцем.

Публиковать толькоBlocky,whole UTF-8 trees через уже разрешённый API при подтверждённой credential failure Git. Публичные QA JSON только агрегаты; raw synthetic подartifacts, оригиналы владельца подprivate-inputs — не вGit. Все новые checkpoint ancestry отc729 безопасны; старую private экспериментальную ancestry D94 не публиковать. KIT IMPACT NONE; guidance a1af141, runtime pin5450f9d.

[Результаты](qa/CHALLENGE_CONTENT_0.70_2026-11-16.md),[freeze/gates](qa/challenge-content-2026-11-16/PROTOCOL.md). После подписи source preview заморозить; дальнейшие proof/docs толькоfeature/work. Source preview frozena9b03f3990ec60df991e18acb24b701781f7ada1/tree0454cd231dc7a16cfd4be440bf8c8be342a4cdee,PR checkout40f8726ef48c48e96509e0c59867d668ef870f89. Source checkpoints всех поколений опубликованы с идентичными trees; таблица вqa/PREVIEW_0.70_PUBLICATION_2026-11-16.md. APK/ZIP/инструкция/сырые synthetic QA сохранены владельцу отдельно,не коммитить их.

Дальнейшие docs-only commits толькоfeature/work,preview не двигать. Для повторногоAPK proof checkout точного sourcea9b/40f,не latest docs-tree. После поставки configR3 считать замороженной: следующая игровая правка — новая версия с сохранением прав/resume уже установленной0.70. Phone/human и общийfactorial gate остаются открытыми;доA/B разобрать tasks-only reward/tail,holdout не открывать автоматически.

## Предыдущая точка D94

# Точка продолжения — D94, 16.11.2026

Первая согласованная итерация Blocky_TZ реализована поверх текущей 0.67, не main: аудит, opt-in DecisionTrace через прежний worker/PlayCapture после durable save и один director-budget-v1. Старые hash/RNG совпадают; четыре исходные записи — 1120 ходов — прошли точный replay и независимую клеточную проверку. Исходники только в ignored private-inputs.

Кандидат имеет 5 кредитов, source caps reward=5/relief=2 и gap=2. Первые 12 выдач и все 3 recovery прежние; ordinary constructive plan бесплатен. Бюджет не восстанавливается от очистки, нового дня, resume или revive. Config и gates заморожены локальным f0798b6 до comparisons. 64 baseline +64 development +64 untouched holdout =192 запуска /32168 ходов, применимые gates PASS без tuning. У сильного бота все парные партии цензурированы на 300 ходах. Кандидат manual/HOLD, default v2, rollout OFF. Новые фазы/старты, другое revive window и ad cadence — следующие отдельные этапы.

Первичная 0.68 в CI43830830634 дала 263/264 browser PASS: быстрый Escape во время сохранения shown=true терялся. Ошибка воспроизведена двумя delayed-write тестами и исправлена в0.69: ожидание idle, проверка исходной партии/предложения/deadline и флаг против дублей. Старый showcase не менялся и прошёл. Core/config кандидата между0.68 и0.69 побайтно прежние.

Итоговая preview0.69 / code69, demo ads, analytics OFF. APK11795668байт, SHA-256 f1d221460893d95fd4f73aca7899c1f130570c996b1f52068e40aeed555d4e40. Прежний signer, все99 packaged files иAndroid resources независимо проверены; полные CI/local proof совпадают. APK/ZIP/инструкция сохранены владельцу; ранее выданная0.68 заменена0.69. Не генерировать новый key и не просить uninstall.

Source9aac45e857955d4ce53cb7b2acf2b800e107b9c6, tree4f9c3cdd1042bf32c4c2fa170a034018861af3dd; PR1 checkout23e347ab3461954542e0d87f9f1bc2fb1a700e35 с темжеtree. 352unit, локальные28browser, CI36focused/Android/2emulator PASS. Полный266-browser verify ивесь run43835669338 завершились success. Preview/source frozen: дальнейшие документы только вwork/feature branches.

Публикация и Actions ранее явно разрешены. Ordinary Git чистой ветки снова не имеет credentials; разрешённый whole UTF-8 tree API дал ровно локальное дерево. После auto-review сокращён public QA: только агрегаты иseed/hash recipes, без полных снимков. Публичный a6e0af8 идёт непосредственно отdc26d27, а0.69 отa6e0af8. Локальные экспериментальные предки сraw synthetic JSON не публиковать. Подробные синтетические результаты отдельно сохранены; исходные записи иключи не публиковать. Kit не менялся.

Последующая поставка документов идёт вwork/assist-budget-delivery-20261116 ипубличные feature/work ветки; исходники приложения остаются ровно9aac. Не откатываться к origin/feat/classic-preview без проверки: Git transport уже возвращал старый cached ref после API-публикации. Для независимого APK proof точный marker/tree уже проверены. Документы опубликованы отдельным docs-only коммитом вfeature/work ветках; source preview не двигать.

[Результаты](qa/ASSIST_BUDGET_0.68_2026-11-16.md), [исправление Back](qa/REVIVE_BACK_0.69_2026-11-16.md), [поставка и границы проверки](qa/PREVIEW_0.69_PUBLICATION_2026-11-16.md).

## Предыдущая точка D93

# Точка продолжения — D93,16.11.2026

Исправлен только full-clear bitmap-ring и его cross-дубль. Праздник/ядро/
save/revive/выдачи прежние. Владелец явно разрешил публикацию/Actions16.11;
повторно разрешение не спрашивать. После reset восстановлена D92/public0c4e,
не main. Source86daf152/tree1e32e331 опубликован, preview frozen на нём.
PR1 run43815781553,checkout c9393a15 с тем же tree. Подписанная0.67/code67:
11791100bytes,SHA d528da09a687dd307b04c0efd96502173eccae6f554549ee859ee25fa6e753b2.
Старый cert,99 dist files,demo/off независимо проверены,CI proof совпадает.
APK+ZIP+инструкция сохранены владельцу и прямая ссылка APK выдана.
339 unit/31 focused/Android unit-build/2 emulator PASS. Full verify job
133127380899 ещё идёт в test:e2e; не заявлять весь CI зелёным. При продолжении
сначала проверить итог,а не пересобирать без причины. Новая APK уже пригодна
для ограниченной телефонной пробы; phone speedup/update/resume/demo show
не проверены. Default v2,composition-v2 HOLD,rollout OFF,AppMetrica отложена.
[Поставка](qa/PREVIEW_0.67_PUBLICATION_2026-11-16.md),
[правка/честные границы восстановления](qa/ALL_CLEAR_RING_0.67_2026-11-16.md).

## Предыдущая точка D92

# Точка продолжения — D92, 15.11.2026

На f02a8c6 по kit BLOCKY_NEXT_TASK.md3f0c01d реализовано освобождение
floating с generation guard. Две смены материала hidden36→0, outside44→44;
возврат/новый drag и system reduced motion работают,18 focused/339 unit PASS.
Один praise-эпизод:6 пар+2 traces+cancel, hash c97addcb во всех. Результат
смешанный; scheduler/budget прежние, добавлены opt-in worker wall markers.
Никакого phone FPS/CPU выигрыша из wall intervals не заявлять.
Preview0.66/versionCode66 demo/off, нужен прежний signer из PR1 cache.
APK подписана,99 dist bytes/demo-off/старый cert проверены. PR1 run43738640302:
Android/25 focused/2 emulator/255 full browser PASS, весь PR1 зелёный.
Техническая поставка завершена; phone gate открыт. Не расширять аудит на
новые renderer/quality manager без измеренного эпизода.
[Результат](qa/FLOATING_PERFORMANCE_0.66_2026-11-15.md).

## Предыдущая точка D91

# Точка продолжения — D91, 14.11.2026

По «давай делай» реализован composition-v2; исходники на основе8bdc416,
старый main не использовался.8 стартов/32 поворота, одна обычная линия,
anti-repeat через openingId/seedForDifferentOpening; ранние последующие
выдачи и3 recovery совпадают с v1. Поздняя помощь ограничена после72.
339 unit/7 browser/build/457 human replay PASS.96 bot runs11992 moves:
long-tail dev/lapse +13.1%, holdout −48.7%, bounded exposure0, strong32
censored240. Candidate HOLD, default v2, rollout OFF. Не тюнить по holdout.
Preview65 demo/off, прежний signer обязателен, использовать PR1 cache.
APK0.65 подписана/99 bytes/demo-off проверены, PR1 run43631030232;
25 focused и2 emulator PASS.10мин/210 synthetic cycles без роста пулов;
245 browser PASS. Техническая поставка завершена; дальше телефон/human.
[Поставка](qa/PREVIEW_0.65_PUBLICATION_2026-11-14.md).
[Результаты](qa/COMPOSITION_V2_0.65_2026-11-14.md).

## Предыдущая точка D90

# Точка продолжения — D90, 14.11.2026

Получены новые приватные human records(5)(1)/(6)(1), APK0.64. Исходникf08f60c
восстановлен из актуальной рабочей ветки, не main. Никакой новый gameplay
policy/APK не создавался.457 ходов точно replay + independent cell oracle.

V2:185 ходов до поражения,25 полных очисток. Composition-v1:20/32/220 ходов;
в длинной первая смерть152,68 после revive,4 полных сброса и114 ходов с очисткой линий (включая полные).
Кандидат субъективно интереснее, но long-tail не принят; default v2/HOLD/OFF.
Малые нерегулярные:19/186 уv2,53/276 уcandidate; данные одного владельца.

Повтор старта установлен: во всех4 сыгранных партияхI5,I5,R6 иfull-clear3.
На128 различных seed обе политики109/128 дают эту семью, output RNG128разный.
Текущий wrapper не может заменить площади5/5/6;114/128no-equal-area-slot.
Следующая версия должна разнообразить сами проверенные стартовые наборы
и отдельно проверять поток payoff/обычных линий в длинной ветке. Нельзя
лечить220-ходовой хвост повышением сложности всех партий: уже есть17/32до
первых поражений. Не переопределять v2/composition-v1, не назначать candidate
основным и не запускать новый глобальный директор/ML.

Observed revive17/152:3x3, unchanged tray/score, old-tray witness и дальнейшие
действия проверены. Аналитика выключена; нового кабинета/денег не проверяли.
Исходные записи остаются вне Git, mini-games-kit не менялся.
[Новый отчёт](qa/HUMAN_COMPARISON_0.64_2026-11-14.md).

## Предыдущая точка D89

# Точка продолжения — D89, 14.11.2026

APK0.64.0-preview собрана в PR1 Actions run43492083673, Android job132115588003.
Публикация и разовый API-путь явно разрешены владельцем. Новых разрешений
для текущей поставки не запрашивать. Git CLI без credential; использован
подключённый GitHub create_tree с целыми UTF-8 файлами одним деревом,
без blob API/base64 и force. Обе удалённые истории сохранены.

Удалённый source commitca1e4a1b5e90e4531a282a32ebde2a951ea01864,
родители8894c8a (preview) иc31a49e (исследования). Tree
 da469c11261e82db1a0e421c6aff176ca66fa101. APK checkout/source marker
3316a25fb810af9c7dac7bf7ea2e80375f997429 — merge ref PR1 с тем же tree.
Ветки work/blocky-commercial-iteration-2026-11-13 иfeat/classic-preview
передвинуты наsource commit; main не менялся.

APK11788980 bytes, SHA256
 eb0adbff6cd1161cd927dd6fffd20909ba43dd6b6f66dac732ba660d0f7a7529.
Сертификат e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13:
совместима по подписи иversionCode с0.63; не удалять старую игру.
Независимо проверены v2 signature, manifest64/0.64, все99 web-файлов по
CI proof, packaged analytics key пустой, ads_test_mode=true, live ad IDs пусты.
Native data sending отключается; demo ads. Не выдавать это за проверку
показа рекламы или физического телефона.

Локальная полная история D79–D88 сохранена в D88 bundle. Public runtime,
Android, tests/e2e/scripts/settings побайтно совпадают; отличаются только9
новых тяжёлых generated QA files, оставленных в полном пакете.

Итоги:332 unit,21 native,25 focused browser,2 Android-emulator PASS.
Полный browser CI243/244, один старый test-race принятия первого хода.
В e2e/rewards.spec.ts добавлен observable commit barrier: до исправления2/5
падали, после10/10 и весь затронутый файл4/4 PASS. Runtime/native/package
файлы после APK не менялись. Полный244 повторно не прогонялся; не заявлять
глобально зелёный CI. Для следующей поставки сохранять этот test fix.

[Текущие проверки](qa/PREVIEW_PUBLICATION_2026-11-14.md),
[инструкция владельцу](qa/PLAYTEST_0.64_RU.txt).
Следующее: human v2/composition-v1, revive с demo на телефоне, лаги с замером.
AppMetrica cabinet/export отложены владельцем, rollout OFF/default v2.

## Предыдущая точка D88

# Точка продолжения — D88, 13.11.2026

Владелец отложил AppMetrica. Preview0.64 теперь по умолчанию без отправки
аналитики, с тестовой рекламой; `--analytics test` — явный последующий opt-in.
SDK36/build-tools36/platform-tools и полный JDK21 уже установлены в текущей
среде. Весь Android-код скомпилирован, 21 Android unit и повторные 332 unit/
web build прошли. Прежние утверждения D87 о недоступном Android toolchain
больше не описывают текущее состояние.

Оригинальный signer был восстановлен cache в CI42845500290; это подтверждено
логом Android job129947035051 и сертификатом. Локального приватного ключа нет,
новый не создавать. В workflow теперь fail вместо генерации подменного ключа.
Git CLI в текущей среде не авторизован; подключённый GitHub app имеет доступ
к репозиторию, но сам по себе не выдаёт shell credential. Соблюдать AGENTS:
обычный Git, без blob API/base64/передачи кусками. Подписанная APK0.64 пока
не получена. Unsigned assembleDebug прошла;99 web-файлов и packaged ресурсы
сверены. Push новой ветки обычным Git отклонён auto-review как публикация
исходников в публичный репозиторий без явного разрешения. Не повторять и не
обходить этот отказ; сначала получить явное разрешение владельца на публикацию
ветки и запуск Actions. [Текущий протокол](qa/PREVIEW_WITHOUT_ANALYTICS_2026-11-13.md).

## Предыдущая точка D87

# Точка продолжения — D87, 13.11.2026

Ветка `work/blocky-commercial-iteration-2026-11-13`, база D86/46c2751.
Реализован TASK.md из приложенного handoff. Исходники0.64.0-preview, не APK.
Базу D86 не откатывали, main не использовался. Оригинальные записи остаются
в private-inputs вне Git; в tests только анонимизированные regression cases.
mini-games-kit не изменён.

1. Revive: общий 24000 work budget, доказательство остатка лотка; две плохие
   зоны заменены, два положительных случая сохранены. Selection фиксируется
   до deadline, старые plans/earned не пересчитываются. Параметры не менялись.
2. Один кандидат composition-v1: равноразмерный слот L3/T4/SZ4, два других
   сохранены; общий extra12000, новый witness/certificate, история4. Default
   director-v2; assignment и rollout выключены. Новую архитектуру не строить.
3. Schema2 funnel/late reopening/milestones/interstitial reasons; native ILRD
   → AppMetrica AdRevenue с frozen context. Канонический source blocky_ilrd_v1,
   не складывать автоматический/диагностический поток. SDK delivery не проверена.
4. Stable50/50 assignment готов, ручная проба отделена, новый existing run
   назначается с новой партии. Kill switch не стирает assignment. Метрики:
   scripts/commercial/metrics.py, normalize_appmetrica.py, пример synthetic.
5. Bounded minute/resource diagnostics и10мин Chromium soak203cycles; причина
   лагов телефона не установлена, renderer/праздник не урезался.

332 unit /53 файлов, build,27 browser и2 final new сценария,5 Python,3 JVM
parser PASS. Последние guard-изменения перепроверены затронутыми tests/tsc.
663 frozen historical moves,88 pre-deal/264 independent witness moves,
48 fresh engineering launches (27 ended/21 censored180). Кандидат увеличил
малые формы, но bounded партии короче, strong-награды реже: balance HOLD.
Не включать default/rollout по автотестам.

APK нет. build-preview.py --check: SDK36/build-tools36, полный JDK tooling,
прежний preview signer и APPMETRICA_TEST_API_KEY отсутствуют. Native parser
проверен отдельно компилятором OpenJDK21 source/target17; Android bridge/APK
не компилировались. Не выдавать0.63 за новую сборку, не менять подпись и не
просить удалять старое приложение. CI workflow уже умеет test key + старый
cached signer; запуск на новом commit не выполнен.

Git push не выполнялся. Outbound dry-run отклонён auto-review как неавторизованная
передача metadata репозитория/ветки. Не обходить отказ и запрет blob API/base64/
передачи Git кусками. Сохранить цельный bundle от c31a49e, включая D79–D87.

Сначала сборка/нативная интеграция и отдельный test AppMetrica cabinet/export,
затем телефон и человеческое сравнение v2/composition-v1 с одинаковым revive.
Не создавать второй кандидат автоматически. Все оставшиеся gates/команды:
[отчёт](qa/COMMERCIAL_ITERATION_0.64_2026-11-13.md),
[инструменты](../scripts/commercial/README.md),
[поручение](COMMERCIAL_ITERATION_TASK_2026-11-13.md).

## Исторический handoff D86

# Точка продолжения — D86, 13.11.2026

Ветка `fix/human-playtest-review-2026-11-13`, основа `fa2e3e4` / D85.
Восстановлена из D85 bundle поверх подтверждённой remote D78/c31a49e.
Получены два человеческих файла одного владельца на APK 0.63:

- `blocky-play (3).json`: flow-v4, 402 хода одной незавершённой партии,
  без revive, all-clear 7/318/321/326. Это отзыв о невозможности проиграть,
  повторяющихся композициях и лагах к концу.
- `blocky-play (4).json`: director-v2, 261 ход, три окончательно завершённые
  партии по 29/50/182 с одним revive в каждой. Ещё один пустой старт исключён.
  Уточнённый отзыв: интереснее, можно проиграть, слишком много больших
  квадратов/прямоугольников, мало небольших интересных форм.

663 exact hash replay и независимые клеточные проверки PASS; 315 unit / 49
файлов PASS. См. scripts/calibration/analyze-human.mjs и
[анализ](qa/HUMAN_PLAYTEST_2026-11-13.md),
[числа](qa/human-playtest-2026-11-13/analysis.json). Исходные записи не
публикуются в репозитории; в analysis есть имена и SHA. Приложенные исходники
у владельца сохраняются как два его файла, не смешивать их порядок с
порядком перечисления вложений в чате.

В v2 47,7% выданных фигур от 6 клеток, 6,1% малых непрямоугольных; в flow-v4
15,6%/34,1%. В v2 88/88 состояний выдачи допускали отдельное размещение малой
непрямоугольной фигуры, но такие формы предложены в 15/88 лотков. Это не
доказательство произвольной совместной альтернативы. Простая смена весов
shapes.json недостаточна: director beam выбирает по результату, не этим весам.

Новое человеческое основание снимает прежнее отсутствие конкретного дефекта:
следующий узкий кандидат — разнообразие форм/размеров внутри полезной тактики
v2. Не обещать принятое улучшение; нужны новые seed и повторная оценка.
Не переопределять существующий v2, его сохранения и replay; старые отвергнутые
v3–v6 не переименовывать новой реализацией. Нового кандидата пока нет.

Лаги первой записи реальны как сообщение владельца, причина неизвестна.
54 620 байт при лимите 800 000; переполнение буфера записи не подтвердилось.
Node CPU записи низок, но Android FPS/heap/thermal/renderer этим не измерены.
Worker выдачи, сохранение, оформление и рост ресурсов профилировать отдельно;
не срезать праздник и не отключать запись вслепую. Runtime и APK 0.63 прежние.
Human cohort/POCO/release-sized games открыты. Запрет Git blob API/base64/
переноса кусками действует. Новый `push --dry-run` также завершился
`unable to get password from user`; push нет, сохранить цельный D79–D86 bundle.

## Исторический handoff D85

# Точка продолжения — D85, 12.11.2026

Текущая ветка `fix/playtest-capture-readiness-2026-11-12`, основа
`ee1632a` / D84. Исправлено подтверждение выгрузки записи по ревизии вместо
числа событий: очистка/новая запись той же длины и запоздалый старый экспорт
не снимают защиту. В записи показана фактическая текущая выдача; примечание
при выборе следующей соответствует режиму. Core, RNG, scoring, schema и
default `director-v2` неизменны. 315 unit / 49 файлов, build, 11 browser PASS;
регрессия подтверждена падением нового сценария на прежнем `main.ts`.

Новая APK не собиралась: установленная 0.63 этих UI-правок не содержит, но
подходит для сравнения существующих flow-v4/v2. Human feel/баланс, POCO,
native share и release-sized cohort открыты. Не продолжать автоматически
строить нового генератора без нового основания. Запрет Git blob API/base64/
переноса кусками действует. `ls-remote` подтвердил основу `c31a49e` / D78;
`push --dry-run` завершился `unable to get password from user`, нового push
нет. Цельный bundle продолжения должен включать все локальные D79–D85.

[D85: изменения и проверки](qa/PLAYTEST_READINESS_2026-11-12.md).

## Исторический handoff D84

Ветка `research/committed-rollout-2026-11-12`, основа2144b45/D83. Запрет Git
blob API/base64/переноса кусками действует; ordinary Git раньше не авторизован,
нового push нет. Последняя подтверждённая remote точкаc31a49e/D78.

Узкое изменение: frozen D83 selector выбирает тройку, следующие2 refill
исполняет v2 по фактическому полю, затем новый выбор. Не сохраняются будущие
координаты/фигуры, all-clear не отменяет расписание. Это offline counter,
не production save migration и не утверждение о phase-free архитектуре.

Технический gate PASS: все55 старых held-v2 случаев,2616 forks654 контекстов
и104 достаточно длинных strong-участка совпали с прогнозом, mismatch0.
Свежие8 snapshot/96 source moves,160 matched и32 игровых запуска/6077 moves.
16 ended/16 censored240. Bounded matched поsplit hold3/1, replan3/1, short1/9,
v2 1/1. Late bounded hold0/2 в обоих split. Strong hold rate.14792/.18125,
оба выше frozen. Линии/повторыPASS, общийbehaviorREJECT, APK0.63 прежняя.

Не считать исправление согласованности доказанным улучшением игры. Не тюнить
этот wrapper по этимseed и не увеличивать horizon автоматически. Рекомендуемый
следующий шаг — человеческое сравнение существующих flow-v4/v2 на0.63 по
docs/qa/dealer-architecture/human-comparison.md. Нужен повторяемый наблюдаемый
дефект опыта для следующего вмешательства; текущие данные нового генератора
не обосновывают. Это рекомендация по доказательствам, не требование отдельного
разрешения владельца или запрет другой явно заданной работы.

1058 contexts,111265 forecast actions,6077 actual,471 regression,22996 fork,
96 source и42783 proof public/cell replay прошли;313 unit/build, production157
файлов прежние. Runtime-cost/phone не исследовались послеbehaviorFAIL. Human,
POCO иrelease cohort открыты; игровойbrowser/worker/Android не запускались.

[D84: протокол, данные и команды](qa/COMMITTED_ROLLOUT_2026-11-12.md).

## Исторический handoff D83

Ветка `research/played-rollout-2026-11-12`, основаa4cc8d0/D82. Требование
владельца: никакого Git blob API, base64 и передачи кусками. Последняя
подтверждённая публикацияc31a49e/D78; нового push нет, Git ранее не авторизован.

По прямому поручению сделан один wrapper: v2 current tray + frozen C1 pool,
реальные forecasts9 противsame-pool short3 иunchanged v2. В прогнозе будущее
v2, в реальности селектор пересчитывается после каждой тройки. Post-base RNG
и v2 cursor общие, actual bag history исправляется. Это не новый phase-free
dealer; новых глобальных фаз/save version нет.

12 sources/144 moves:3 старых непустых и8 новых snapshot;1 старое empty
явно отмечено.165 matched+24 полных игровых запуска/5006 действий:11 ended,
13 censored240. New bounded matched events v2/short/rollout:development0/1/0,
confirmation4/11/2. Full bounded late reward rollout0/2 и1/2. Strong rate
.1000/.10625: второй split выше frozen. Линии/повторы проходят, общий REJECT.
Не включать ни D83, ни short и не тюнить на этих seed.

Post-hoc held-v2 audit: fresh bounded реальные0/2 наград по split против1/5
при том же первом лотке и дальнейшемv2; даже held не вышеshort1/11. Strong
на312 перекрывающихся окнах:60 reward mismatch,57 прогноз больше. Это часть
проблемы, не единственная доказанная причина. Конкретный3301002/.125: первые
3 хода одинаковы, v2 продолжает R6/I2/O2 и награда на9; новый отбор заменяет
их L52/O3/I5, награда теряется. Перед новыми балансными циклами проверять
согласованность прогнозируемой и исполняемой политики, не увеличивать глубину
автоматически и не хранить обязательный маршрут для игрока.

958 pools/1037 decisions,93207 forecast actions,5006 actual,16689 proof,
144 source и471 audit клеточно/public проверены.313 unit/build;157 production
файлов прежние. APK0.63/v2, human/POCO/release gates открыты. Оптимизация
стоимости не начиналась после отрицательного behavior; новый игровой browser,
worker и Android не запускались.

[D83: протокол, полный отчёт, данные и команды](qa/PLAYED_ROLLOUT_2026-11-12.md).

## Исторический handoff D82

Ветка `research/branch-preparation-2026-11-12`, основа2492e17/D81. Запрет
Git blob API, base64 и передачи кусками действует. Последняя подтверждённая
публикация c31a49e/D78; обычный Git ранее не авторизован, нового push нет.

Один frozen offline способ: все5456 мультимножеств screening5, top8 через
полный неизменённый boundedOptions tree, локальный cover/линии.570 эпизодов:
31 прежнее поле и13 непустых новых snapshot из8 v2 партий. На прежних награда
2/155 против11/155 D81, на новых12/130 против18/130. Все12 новых наград уже
на3-м ходе; новые выдачи за9 ходов не добавляют наград. Не менять thresholds.

Новых тупиков0; у44 первых троек681 leaf/dead0, но обязательная линия на
каждой ветви только41/44. Обычные очистки на парных380 первых новых действиях
281 против160 D81. Native6 после новых первых троек:143 положительных пути,
83 unknown,8 уже с наградой; это witness, не доступность будущих троек.
Проба REJECT. Не тюнить геометрический proxy под старые31 или эти новые поля.
Следующий наградный объект — фактические продолжения выдач тем же игроком,
а не свободный путь/cover. Не вводить автоматически v7/глобальные фазы.

2952 tree/93809 leaves, полный JS screen5456, source8 games/180 ходов,
actual3699 moves,17054 cell transitions и218 свободных reward routes/1135
действий проверены;369 preparation+483 reach native replay;313 unit/build.
157 production-файлов прежние. APK0.63/director-v2 сохранена. Human/POCO и
release-sized cohort открыты; новый игровой browser/worker/Android не делался.

[D82: протокол, результаты и команды](qa/BRANCH_PREPARATION_2026-11-12.md).

## Исторический handoff D81

Ветка `research/geometry-recovery-2026-11-12`, основа локальный D80/4aa00a4.
Запрет Git blob API, base64 и передачи кусками действует. Последняя
подтверждённая опубликованная основа c31a49e; обычный Git ранее не авторизован.

Найдены длинные пути на29/31 прежних engineering-полях:5–9 ходов,176 линий,
128 обычных clearing moves, dry gap≤2. Но неизменённый boundedOptions с
фиксированными тройками получил5/145 наград; перестроение по реальному полю
между тройками11/145. Ни одно поле не прошло все пять квантилей.27/29 witness
содержат ход вне разумного набора бота,14 уже первым действием. Средний cover
после точных трёх ходов3.48, после bounded5.73 (139 полных первых троек).

Это положительные пути и отрицательная проверка доступности, не новый принятый
генератор. Не переносить native beam/witness projection в runtime, не тюнить
эту пробу под те же31 поля. Сначала проверять подготовительные тройки по
фактическим разумным продолжениям. Не вводить автоматически v7/глобальные фазы.
Два beam miss остаются unknown; D80 невозможность≤3 сохраняется.

201 native query повторены,1831 фактический ход клеточно/public проверен,
41 короткое поле независимо исчерпывающе проверено (7.7 млрд last-fit),
24 tiny cell oracle,313 unit/build. Просмотрщик31 полей прошёл desktop/mobile
Chromium; игровой browser/worker/Android заново не запускались. APK0.63/v2,
source/runtime/Android/lockfile прежние. Human A/B, POCO и release cohort открыты.

[D81: отчёт, данные, команды и автономный просмотрщик](qa/GEOMETRY_RECOVERY_2026-11-12.md).

## Исторический handoff D80

Ветка `research/reward-reachability-2026-11-12`, основа восстановленный локальный
D79 `adfeced`. Предыдущая ветка `spike/local-choice-2026-11-12` локально цела;
последняя подтверждённая опубликованная точка — D78/c31a49e. Обычный push в
этом окружении не авторизован. Не заявлять публикацию без успешного push.

**Требование владельца: никакого Git blob API, base64 и переноса файлов кусками.**
Закреплено в AGENTS.md. Использовать обычный Git и цельный пакет восстановления.

Новый факт: все31 позднее поле engineering C1/bounded не допускают all-clear
за1/2/3 произвольных размещения полного каталога. Это исчерпывающий результат,
подтверждённый отдельным прямым перебором (3 050 202 592 last-fit проверки).
Не смешивать его с прежними unknown-пробами D79 или частотой таких полей у людей.
155 положительных witness/465 действий прошли клеточные и public-rule проверки;
313 unit/build прошли. Код/данные в `reward-reachability`.

Новый генератор/коэффициенты не создавались; C1 REJECT, APK0.63/director-v2.
Следующий инженерный вопрос — восстановление геометрии за несколько выдач с
обычными очистками и несколькими разумными продолжениями. Немедленный all-clear
на этих полях нельзя получить улучшением трёхходового ранжировщика. Сначала
доказать маршруты/доступность, не строить автоматически v7/global phases.
Human A/B flow-v4/v2 и POCO остаются открытыми.

[Доказательство, границы и команды](qa/REWARD_REACHABILITY_2026-11-12.md).

## Исторический handoff D79

Текущая ветка `spike/local-choice-2026-11-12`, основа D78/c31a49e.
По поручению продолжить сделан ровно один офлайн-кандидат C1, без будущих целей
и phase state machine: пул до4 доказанных троек, оценка нескольких первых и
вторых действий с выбором любой оставшейся фигуры. Небольшая память о реальном
all-clear/recent bags сохранена. Отдельный same-pool random контролирует отбор.

**C1 REJECT. В runtime/default/APK его нет. Последняя APK0.63/director-v2.**
Не продолжать C1 коэффициентами или переименованием в v7. Новый user scope
может разрешить другой эксперимент, но не превращает этот результат в успех.

## Что закончено

- 48 engineering +384 frozen holdout партий /90 111 ходов. Новые development
 2541001–2541008 и confirmation2561001–2561008; code/player/gates неизменны.
- 48 одинаковых входов D78/192 варианта/5760 plays. У bounded ранжировщик
 дал601 линию/11 наград против599/13 у случайного выбора из того же пула.
- Все432 партии,30 309 issued witness,41 734 pool bags,162 253 sampled paths,
 262 146 external continuation paths независимо повторены; Python oracle для
 всех matched-plays. 313 unit/49 файлов, build и offline types прошли.
- Source/runtime/lockfile прежние. Browser/worker/Android заново не запускались;
 новый candidate save version не вводился, т.к. offline gate не пройден.

## Почему отказ

Bounded: late reward после12 —0/8 в обоих split; медиана29/17 ходов,
broad89.4%/80.0%. В confirmation линии76.9% v2. Three:47/2880 и60/2657
all-clear, обе частоты ниже0.03. Некоторые другие показатели проходят, но
провалы не перекрываются общей средней и не исправляются переносом в APK.

В72/33 поздних bounded-выдачах в пуле не было ни одного сохранённого наградного
маршрута. Выбор между этим же пулом не решит отсутствие наградного материала.
Для60/72 и32/33 полей минимальный row/column cover>4; старый static finishGoal
класс<=4 не покрывает их. Это НЕ доказательство невозможности all-clear.
Две дополнительные ограниченные пробы на12 engineering-полях дали0 новых
путей; пропуски unknown. Не заявлять, что снятие cutoff или больше CPU уже
доказанно исправляют проблему. Условное meanReward evaluator также не является
вероятностью доступности: unknown/unsafe ветви исключались из знаменателя.

## Следующее осмысленное действие

Сначала показать воспроизводимое создание доступной награды на реальном
позднем поле bounded, сохраняя обычные линии и несколько решений. Не повторять
этот ранжировщик с коэффициентами. Это не доказательство обязательности global
director и не опровержение всех local dealers. Нужны также реальные человеческие
наблюдения: существующие flow-v4/v2 уже переключаются в0.63 по протоколу D78.
Human feel, POCO lag и release-sized cohort открыты.

[D79: код, данные, replay и ограничения](qa/LOCAL_CHOICE_2026-11-12.md).
Ниже сохранён исторический D78 handoff; его статус до C1 не является текущим.

## Исторический handoff D78

Текущая работа: `research/dealer-architecture-2026-11-12`, на основе D77
`d3cd06aea25be4781795e4c835abd346e4c68bb0`. Preview0.63/director-v2 остаётся
последней рабочей APK. Runtime и lockfile не менялись. Main не рабочая основа.

По прямому решению владельца больше не продолжать автоматически v6→v7.
Сначала проверена гипотеза о неправильном объекте оптимизации и измерителях.
**Эта инструкция заменяет автоматическое продолжение старого плана D77 ниже.**

## Завершено сейчас

- Изолированный строгий random comparator с replayable witness и явным reserve;
  существующий solvable-v1 может иметь fallback без доказанного решения.
- Дополнительные bonus-aware боты при неизменных старых:6 реальных bounded
  наградных троек D77 дали1→2 награды;126 three-троек126→126. В свежих полных
  партиях aware-пары имели те же действия. Это не объяснение всего провала.
- 336 партий /55 442 хода на новых split,3 политики,2 каталога,7 определений
  игроков;48 snapshots/288 выдач/10 080 tray-розыгрышей.
- 864 переноса тех же троек между полями,10 368 розыгрышей. Состав точно
  сохранён; подбор под поле даёт сильный эффект, даже среди разрешимых троек.
- Все новые336 партий,18 710 witness и продолжения независимо повторены;
 787 положительных/77 отрицательных перестановок проверены масочным обходом.
- 310 unit/48 файлов, build и отдельные TS-типы прошли. Новый browser/Android
  не запускался, человеческих данных и подтверждения POCO не появилось.

## Решение / следующий шаг

ADOPT офлайн-стенд; HOLD новый runtime-генератор. Необходимость глобальных фаз
не доказана, но откат на flow-v4 или решаемый рандом весь запрос не решает.
V2 full/three:347 all-clear/1920 ходов (одна на5.53), bounded8 наград в5/8 партий.
Flow-v4:54/1920 у three,0 наград у bounded. Common-каталог сохраняет паттерн.
Это модельные результаты, не эмоции/retention людей. Различия конечности не
лечить намеренно смертельными тройками; цензурированные игры не бесконечные.

Следующее ограниченное действие — человеческое сравнение двух **существующих**
выдач на APK0.63: в новой партии раскрыть «Экспериментальная выдача», выбрать
«Прежняя выдача» либо «С задачами и нагрузкой». Форма/порядок уже подготовлены.
Нужен конкретный повторяемый человеческий разрыв для одного вмешательства.
Не создавать новый куратор с шестью шкалами только ради продолжения работы.
При новых требованиях владельца этот HOLD можно пересмотреть явно.

Полный диагноз, ограничения, первичные данные и команды:
[DEALER_ARCHITECTURE_2026-11-12.md](qa/DEALER_ARCHITECTURE_2026-11-12.md).
[Качественный плейтест](qa/dealer-architecture/human-comparison.md).

## Исторический handoff D77 — исправления ниже не являются текущим backlog

Репозиторий DanilaH/blocky-block-puzzle. Последняя рабочая APK:0.63/director-v2.
Main сильно старее рабочей разработки; не выбирать его начальной точкой.
D76 восстановлен в `feat/director-reward-paths-2026-11-11` /fd55fc9; D77 находится
в `feat/director-constructive-2026-11-11`. Начинать с текущего HEAD этой ветки.

## Цель владельца

Разные отрезки партии: напряжение, передышка, заметная приятная награда.
Обычный неточный игрок должен получать её без идеального расчёта; сильный
видит последствия ошибок и естественный конец. Выразительные эффекты сохранять.
Лаг полной очистки POCO M6 Pro открыт; стенд не заменяет физическое измерение.

## Что уже сделано — не повторять

D75/v4: проверка трёх первых и трёх вторых ходов в помощи, честный fallback,
конкретная подготовка и повторная проверка по реальному полю.
D76/v5: несколько окончаний, до12 развязок, приоритет готовой награды.
D77/v6: ветвящееся построение префиксов, учёт промежуточных линий, независимый
повтор будущих развязок, полная интеграция версии в save/worker/revive.

Все кандидаты v3–v6 не приняты по балансу. APK на них не выпускали.
У v6 прошли306 unit,9 browser, build/assets, новый replay160 партий/32 092 хода
и576 исторических партий/110 462 хода. Старые saves точны, default не менялся.
Фактические отрицательные данные и протоколы сохранять.

## Последний контроль

Новые development1941001–1941008 /confirmation1961001–1961008. Bounded:
награда до60 —2/8 и5/8; после12 —0/8 и2/8; линии77.90%/69.63% baseline.
Three: награда раз в24.0/21.18 хода. Lapse: закончено0/8 и1/8. Поэтому v6
в APK не переносить. Контрольные seed не превращать в инженерную настройку.

## Конкретная следующая работа

1. Построитель D77 перебирает места при заданном порядке фигур. Игрок выбирает
   любую из оставшихся. Следующая проба должна строить саму неупорядоченную
   тройку с несколькими разумными первыми И вторыми действиями, включая выбор
   фигуры. Повторная сертификация готового идеального кандидата этого не решает.
2. У bounded6 найденных наградных троек дали1 фактическую награду; первое
   действие сертифицировано в5 случаях, второе в1. Не смешивать безопасность
   остатка с доступностью полной очистки.
3. Добавочные фигуры короткой развязки могут отвлекать. Воспроизводимый пример:
   seed1941002/move123, строки[0,247,0,0,0,0,0,0], S1 против добавочной I2-1.
   При том же RNG другие заранее заданные добавочные фигуры сохраняют награду.
   Это диагностическая абляция одного случая, не принятый новый кандидат.
4. Сохранять поток обычных линий и последствия ошибок; прямая сборка одних
   палок и постоянная широкая помощь уже показали отрицательные последствия.
5. Новая политика — новая сохраняемая версия и новые контрольные seed,
   затем APK/человеческая проба при положительном пилоте. Не ослаблять gates.

Не продолжать перебирать коэффициенты старого построителя по текущему
контролю. Сначала воспроизводимый структурный пример и маленькая инженерная
проверка. Не расширять scope метой/Adventure/визуальным редизайном ради обхода
проблемы выдачи. Не объявлять ботов человеческим балансом.

Полный отчёт, исходные позиции, действия и команды:
[DIRECTOR_CONSTRUCTIVE_2026-11-11.md](qa/DIRECTOR_CONSTRUCTIVE_2026-11-11.md).
