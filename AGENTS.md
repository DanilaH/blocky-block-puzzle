# Работа в репозитории

Сначала прочитать README.md, docs/DECISIONS.md, docs/ROADMAP.md и исходное ТЗ. Приоритет документов указан в README.

- Реализовывать Classic v1 по этапам; Adventure и универсальный движок не входят в текущий scope.
- До копирования платформенного кода проверить актуальный game-kit и записать исходный commit.
- Ядро/выдача/подсказка отдельно от Phaser, UI, storage и SDK. Анимации не источник состояния.
- Принятый ход, подсказка и награда публикуются только после атомарного сохранения; повтор событий безопасен.
- Не привязывать выдачу к рекламе; не использовать чужие ad units, package IDs или ассеты без разрешения.
- Проверять существенные изменения тестами по §11 ТЗ. Реальный Android и человеческий плейтест не заменять web-тестами.
- Не заявлять устройство, производительность, звук или рекламу проверенными без протокола.
- Не коммитить ключи подписи, credentials, приватные конфигурации и сборочные артефакты.
- После этапа обновлять ROADMAP с доказательствами; нерешённые gates оставлять открытыми.

## mini-games-kit: task-routed research and kit feedback

This work is on the actual Block Puzzle research branch with latest handoff docs/SESSION_HANDOFF.md; **main is an outdated scaffold** and must not be used to infer current gameplay. Product decisions above remain authoritative. Before substantial work, choose the 1–2 relevant studies from docs/kit-guidance/TASK_ROUTER.md. When an original Block Blast/reference video, input feel or card layout is cited, follow docs/kit-guidance/REFERENCE_PROTOCOL.md and distinguish OBSERVED/INFERRED/UNKNOWN.

Guidance snapshot: e2382670fbd5c2aa76462fea688c60de2b067392. This does NOT change the currently installed runtime kit version, APK policy, game RNG, scoring or director-v2/v6 state. Do not treat simulated path proofs as human feel or automatically add another global director.

End material tasks with KIT IMPACT: NONE / REUSE / IMPROVE / CANDIDATE / EXTRACTED, with a reproducible local example and proposal to the shared kit when it is actually general (docs/kit-guidance/KIT_FEEDBACK_LOOP.md). No automated gameplay/SDK changes or new APK.
