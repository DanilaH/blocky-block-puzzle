# Дополнительная диагностика очистки

Основной вывод: `../LAG_DIAGNOSTICS_0.49_2026-11-07.md`. Ни один кандидат не принят в обычную игру. Следующее решающее измерение — автозамер физического POCO M6 Pro через APK 0.49.

## Содержимое

- `measurements.json`: 208 стендовых эпизодов, каждый rAF-ряд и настройки, исходы и маркировка валидности. 44 эпизода с потерянным texture key явно невалидны и исключены из gates. 16 shader-discard эпизодов — ограниченное наблюдение без отдельного доказательства вмешательства.
- `clear-fixtures.json`: две анонимизированные реальные позиции из первого журнала и отдельный синтетический triple-clear proxy для числа линий/серии из аппаратного файла. Proxy не восстанавливает неизвестное поле телефона.
- `confirmation-plan.json`, `energy-confirmation-plan.json`, `energy-trim-confirmation-plan.json`: границы конкретных последующих сравнений, источник и hashes. Это не регистрация ранних разведочных прогонов задним числом.
- `snapshots/native-trim.ts.txt`, `snapshots/energy-border-64.ts.txt`: сохранённые промежуточные варианты. Они не импортируются приложением.
- `production-smoke.json`: полный production smoke автоматического сценария на SwiftShader, не результаты телефона.
- `apk-verification.json`: версия/подпись/содержимое готового APK, добавляется после проверки.

`manifest.sourceCommit` ранних серий — HEAD до незакоммиченного экспериментального изменения. Для разбора нужен описанный вариант/инъекция, а не только этот SHA. Косметическая случайность не фиксировалась; аппаратные кеши браузера не сбрасывались между контекстами.

## Повтор стендового A/B кеша

Использовать текущие закреплённые зависимости, один браузерный batch за раз. Значение `oldEnergyBorder:true` возвращает исходные четыре рамки только в диагностической in-memory сборке. Обычная игра 0.49 всегда использует исходник.

```sh
PROBE_BUILD=production PROBE_FIXTURE_FILE=docs/qa/lag-049/clear-fixtures.json PROBE_ROUNDS=3 PROBE_REPEATS=2 PROBE_CONDITIONS='[{"kind":"allclear","fixtureIndex":0,"androidUA":true,"dpr":2.75,"viewport":{"width":392,"height":872},"revealVariant":2,"oldEnergyBorder":true},{"kind":"allclear","fixtureIndex":0,"androidUA":true,"dpr":2.75,"viewport":{"width":392,"height":872},"revealVariant":2}]' PROBE_OUTPUT=/tmp/repeated-clear.json node scripts/audit-performance-probe.mjs
```

Повторить отдельно с fixtureIndex 1/2 либо добавить обе пары в условия. Android UA меняет детектирование, но не превращает SwiftShader в GPU Android. Материал/вариант праздника — контрольные, не восстановленные телефонные настройки.

`node scripts/performance-probe/pack-lag-049.mjs /tmp` пакует сохранённые raw-файлы перечисленных исторических серий; они являются локальными промежуточными данными. Итоговые ряды уже сохранены в measurements.json. Инвалидные серии не участвуют в вычислении gates. Округление временных рядов в пакете — до 0,001 мс; итоговые счётчики берутся из исходных измерений.

## Проверки приложения

```sh
npx playwright test e2e/clear-benchmark.spec.ts e2e/energy-border.spec.ts --workers=1
npm run build
node scripts/qa-clear-benchmark.mjs /tmp/production-clear-smoke
```

Dev-only `?test=fast` ускоряет только функциональные e2e. Production smoke намеренно передаёт этот параметр и проверяет, что он игнорируется: фактические окна остаются 2100/2400 мс. Стандартный полный сценарий — warmup + 7×2 эпизода, около 70 секунд. Никогда не использовать быстрый dev-прогон как измерение производительности.

## Разбор будущего аппаратного файла

APK экспортирует `schema: blocky-clear-benchmark-v1` (Android filename — blocky-performance.json). Проверить completed/interrupted, семь одинаковых условий в прямом/обратном порядке и viewport/canvas. Warmup хранится отдельно. Сопоставлять интервалы с placement/themeReveal/allClearFestival внутри каждого эпизода. Нулевые ms у themeReveal/allClearFestival — отметки времени запуска, не измеренная нулевая стоимость работы. Два повтора — диагностическое сравнение, не статистическое доказательство; не выдавать профиль без слоя за готовую оптимизацию. Сцена не включает HUD партии, input, выдачу или IndexedDB-save, звук и рекламу; это целевая проверка визуального участка.
