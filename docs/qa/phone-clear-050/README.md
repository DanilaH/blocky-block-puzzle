# Данные точной очистки POCO и кандидат preview 0.51

Основной протокол: [PHONE_CLEAR_0.50_2026-11-08.md](../PHONE_CLEAR_0.50_2026-11-08.md).

- `phone-analysis.json` — обезличенные относительные rAF/CPU-фазы из реального файла 0.50; ноль времени — marker полной очистки.
- `fixture-1574.json` — точное состояние и ход из добровольного экспорта, GameId уже заменён на `diagnostic-game`.
- `confirmation-fixtures.json` — новая позиция с остаточной Celebration от предыдущей очистки и две старые игровые позиции. Оформление старых позиций неизвестно: proxy 0→5, canvas1024². Новая — 0→1, canvas896².
- `plan.json` и `confirmation-plan.json` — планы до подтверждающих прогонов, ограничения и инженерный gate.
- `measurements.json` — пять серий, 174 валидных эпизода: screen36, ink28, flat20, confirm54, integrated36. `contexts` дедуплицирует конфигурации; каждая episode хранит исходные rAF-пары `[relativeEndMs, intervalMs]`, CPU/GL summaries, markers, логический итог и ошибки. `gates` содержит отдельно prototype confirm и integrated. Исключённый первый прогон с неверной камерой отмечен count/hash и не участвует в выводах.
- `pixels.json` — 27 сравнений: контуры отдельно и несколько полных заливок с проверкой painter order и hide/show. Проверенный max≤3/255, mean<0,05/255.
- `apk-verification-051.json` — исходный commit/CI/artifact, версии, SHA-256, совместимая подпись и побайтовое сравнение всех 86 production-файлов.
- `production-smoke-051.json` — обычный production dist, настоящий UI-ход и schema4 export, без преобразования игрового исходника.
- `production-ui-pairs.json` — полные сборки 0.50/0.51, одинаковый UI/viewport/DPR/canvas1024²; три пригодные холодные пары, первая пара исключена из timing-сравнения из-за локальной обработки отчёта. Это вспомогательное подтверждение направления эффекта.

## Повтор интегрированного сравнения

Нужны npm ci и установленный Chromium Playwright. По очереди, не параллельно с другими browser/CPU/GPU тестами:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('docs/qa/phone-clear-050/measurements.json','utf8'));
const run=data.batches.find(b=>b.name==='integrated');
fs.writeFileSync('/tmp/blocky-051-conditions.json',JSON.stringify(run.manifest.conditions));
JS
PROBE_BUILD=production PROBE_ROUNDS=3 PROBE_REPEATS=2 PROBE_DURATION=2400 \
PROBE_FIXTURE_FILE=docs/qa/phone-clear-050/confirmation-fixtures.json \
PROBE_CONDITIONS="$(cat /tmp/blocky-051-conditions.json)" \
PROBE_OUTPUT=/tmp/blocky-phone051-integrated.json \
node scripts/audit-performance-probe.mjs
```

Baseline в этом script явно возвращает исходные рамки и textured wash. У кандидата `flatWashIntegrated=true` подтверждает реальный SpriteInk, а не подмену wrapper. Камера обязана соответствовать backing. У обоих game outcome проверяется автоматически. В обычный APK диагностический plugin не включён.

Визуальные gates и обычный production-путь:

```sh
npx playwright test e2e/clear-wash.spec.ts e2e/energy-border.spec.ts --workers=1
npm run build
node scripts/qa-phone-clear-production.mjs /tmp/blocky-051-production-clear
```

Полные production-сборки сравнивались с `QA_DIST=/path/to/dist` и `QA_VERSION=0.50.0-preview` / `0.51.0-preview`. `QA_VISUAL=1` записывает внутреннее QA-видео и screenshots; полученные frame timings исключаются из performance-выводов. Старый 0.50 dist извлечён из ранее проверенного подписанного APK, не реконструирован из изменённых исходников.

Офлайн-упаковка пяти сохранённых `/tmp/blocky-phone050-{screen,ink,flat,confirm}.json` и `/tmp/blocky-phone051-integrated.json` — `node scripts/performance-probe/pack-phone-050.mjs`. Она не запускает игру, сохраняет hashes raw-файлов и выводит все gates; текущее measurements достаточно для их независимого пересчёта.

Все проценты — инженерные сравнения software renderer. Физический Mali-G57 MC2 и эстетическая приёмка телефона не заменяются Linux/SwiftShader. Исходный лаг остаётся открытым до проверки 0.51 на устройстве.
