# New Game Repo Setup — минимальная и воспроизводимая инициализация

**Действует:** 12.11.2026. **Принцип:** проект получает доказанный технический baseline своей платформы, короткие инструкции агента, локальную карту выбора исследований и **точный guidance SHA** (а Yandex bootstrap отдельно закрепляет ту же версию runtime-зависимости). Он НЕ получает все игровые механики, директора, рекламную политику или контент только потому, что они существуют в kit.

## 1. Выбрать тип проекта, не смешивая разные хосты

**Yandex Games + Phaser:** использовать существующий проверенный mandatory bootstrap:

    npm run bootstrap:create -- ../my-game --orientation portrait

Это копирует реализацию Yandex SDK, real/mock, lifecycle, startup, sound activity, viewport, TS/Vite/Phaser и CI; генерирует AGENTS, PROJECT_DECISIONS и локальную kit task routing. В новом репозитории выполнить install/build/tests, затем заменить BootstrapScene реальным gameplay. Арт и правила ещё не выбраны.

**RuStore/Android + Phaser/Capacitor:** в mini-games-kit на эту дату **нет** равноценного Android bootstrap, который бы воспроизводимо связывал native SDK, подписанный релиз, тестовый ad mode, актуальный target SDK и миграции. Не притворяться, что Yandex Games web bootstrap можно просто «переключить на Android». Пока начинать с проверенного реального Android consumer/технического scaffold и добавить **только агентский контур**:

    npm run guidance:init -- ../my-android-game --platform android --name my-android-game

Команда не устанавливает Phaser/Capacitor, Яндекс мобильную рекламу, Android signing, работу с банковскими и store аккаунтами. Она создаёт AGENTS.md, docs/PROJECT_DECISIONS.md и локальные docs/kit-guidance/ с ссылками на exact kit SHA. Затем отдельно провести android startup, ads, save, UI, native acceptance по [Android Ads](https://github.com/DanilaH/mini-games-kit/blob/e2382670fbd5c2aa76462fea688c60de2b067392/docs/android/ADS_AND_LIFECYCLE.md) и [Android Release](https://github.com/DanilaH/mini-games-kit/blob/e2382670fbd5c2aa76462fea688c60de2b067392/docs/ANDROID_RELEASE_ACCEPTANCE.md). **Будущий android-phaser bootstrap — самостоятельная работа** после сравнения не менее двух реальных Android consumers и проверки полного package lifecycle. Не добавлять недоказанную сборку.

**Существующий репозиторий:** guidance:init намеренно **не переписывает существующий AGENTS.md и docs/PROJECT_DECISIONS.md**. Если они уже существуют, выполнить безопасное дополняющее подключение:

    npm run guidance:adopt -- ../existing-game --kit-ref <exact-research-sha>

Команда **сохраняет оригинальный AGENTS.md** и добавляет короткий раздел + локальные guides; повторное применение отклоняется. Проверить diff перед коммитом. Не уничтожать source-of-truth из работающего приложения. Можно вручную copy/link только нужные docs к закреплённому SHA.

## 2. Что создаёт guidance:init, а чего не создаёт

Создаётся:
- AGENTS.md — краткие **обязательные постоянные правила** и указатели на локальный Task Router;
- docs/PROJECT_DECISIONS.md — проектные факты, baseline, kit adoption decisions, accepted reference deviations;
- docs/kit-guidance/TASK_ROUTER.md — локальная карта триггеров и research docs, чьи ссылки переписаны на **pinned commit**;
- docs/kit-guidance/REFERENCE_PROTOCOL.md — покадровый разбор gameplay/input/motion/layout/feel, если задача с референсом;
- docs/kit-guidance/KIT_FEEDBACK_LOOP.md — обратная связь с kit в финальных отчётах, не автоматический upstream;
- docs/kit-guidance/NEW_PROJECT_SETUP.md — этот контракт для новых consumers.

Не создаются: код и ассеты из чужой игры, release keys, production ad IDs, store assets, gameplay policy, общий analytics/backend, исторические копии всех научных файлов, обязательные тысячи строк test harness. Полные research docs доступны на GitHub под **проверенным pinned SHA** по ссылкам в маршрутизаторе.

## 3. Перед первым gameplay implementation

1. Проверить, что origin boilerplate соответствует платформе и поддерживает реальные game start/stop/save/SDK ошибки. Завести CI, минимум unit/build и хотя бы один реальный gesture/viewport smoke до релиза.
2. Из local Task Router выбрать реальную задачу: core prototype, input/UX, reference reproduction, asset production, release и т.д. Не читать каждый архивный research paper на каждый баг.
3. Открыть [Kit public API](https://github.com/DanilaH/mini-games-kit/blob/e2382670fbd5c2aa76462fea688c60de2b067392/docs/API.md) закреплённого SHA и сделать явный **adoption matrix**: REUSE (импорт и тест), NOT APPLICABLE, LOCAL POLICY (почему не в kit), MISSING (доказанный недостающий контракт). Для часто нужных ресурсов смотреть storage, durable receipts, activity coordinator, audio, layout, haptics, loading/asset formatting.
4. Не копировать готовый экспорт в исходники ради удобства: использовать dependency/совместимый path, pin/upgrade review. На React/DOM/Phaser/Android распространять только подходящий runtime contract; Yandex SDK web отличается от Yandex Mobile Ads Android.
5. Зафиксировать game-specific source of truth: правила/состояния, RNG, версии сохранения, ориентации, основное действие, onboarding, платформу, эстетический выбор и ограничения.
6. Для конкретного референса открыть Reference Protocol, снять наблюдаемые transition/gestures и составить gap matrix. Для нового арт направления до массового производства — отдельный Visual Preproduction/owner approval.
7. После каждого существенного изменения сообщать KIT IMPACT: NONE / REUSE / IMPROVE / CANDIDATE / EXTRACTED. Не обещать автоматическое обновление общего репозитория без upstream PR.

## 4. Почему pin важнее «всегда самая свежая версия»

Новый проект должен иметь воспроизводимое исполнение и знание о том, какую документацию и контракт он использовал. Task Router копируется локально, но полные ссылки на research docs строятся на конкретном **guidance snapshot** kit commit, а не main. **В существующем проекте runtime dependency pin может быть старее guidance pin**: перед импортом API сверить конкретный runtime SHA в package.json/vendor и его контракт. Обновление исследовательских правил не обновляет код автоматически.

Для сравнения с **текущим** kit при рефакторинге допускается посмотреть main, но разница между pinned и new обязательно документируется. Upgrade — отдельный намеренный шаг с тестами. Нельзя ссылаться на новые API в main и тихо считать их доступными старому потребителю.

**Если доступ к pinned GitHub закрыт:** писать NOT READ / UNKNOWN, использовать уже локально собранный код/отчёты, не придумывать содержание исследования. Возможность скачать полный архив заранее для offline работы — отдельный ручной action, не обязательная дублирующая часть bootstrap.

## 5. Назначение AGENTS.md и отличие платформ

У Codex, GitHub Copilot и Claude Code есть поддержка проектных инструкций, но **конкретный loader и precedence зависят от агента/harness**. Краткий repo-root AGENTS — наиболее переносимый общий минимум; в Codex инструкции автоматически читаются при старте, nested AGENTS в подпапках применяются к своим областям; у Copilot/Claude может потребоваться собственная конфигурация/проверка. Проверить реально loaded instructions на целевой среде, не обещать магическое 100% выполнение по Markdown.

Если агент регулярно игнорирует правило, добавить **автоматический тест/CI проверку**, либо специализированный навык/skill при доказанной необходимости, а не ещё абзацы в root AGENTS.

## 6. Первое техническое подтверждение готовности

**Yandex Phaser:** complete npm install, npm run typecheck, npm test, npm run build, npm run release:check, smoke input/lifecycle real/mock, hosted DRAFT только при реальной нужде. CI в kit проверяет создание проекта и его compile/test/audit.

**Android Phaser:** до начала массового контента должны пройти реальный Gradle/debug build, trusted and mocked SDK routes, Android Back/rotation/foreground, save/restoration, portrait/landscape, banner safe-area, no-fill/ads state. До release — подписанный artifact/version, disclosure, device QA и отдельно owner approval на публикацию.

**Success:** агент начинает писать настоящую механику из корректного baseline, по задаче выбирает нужные знания, не повторяет готовые SDK/contracts и своевременно замечает upstream improvement. Не количество созданных папок.
