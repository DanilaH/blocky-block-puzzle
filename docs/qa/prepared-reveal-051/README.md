# Прототип prepared reveal

[Основной протокол](../PREPARED_REVEAL_0.51_2026-11-08.md). В обычную игру не включён; контрольный APK0.51 сохранён.

- `fixture.json` — последний телефонный ход, оформление1→5, вариант2 и остаточная интенсивность предыдущей очистки.
- `phone-analysis.json` — обезличенная сводка исходной0.51, относительные интервалы; исходные productEvents/идентификаторы не публикуются.
- `plan.json` — исходные ограничения памяти, качества и заранее заданный performance gate.
- `measurements.json` —54 сравнительных эпизода, условия, contexts, исходные relative rAF пары, summaries, quality, логические исходы, hashes raw-файлов и отрицательные gates. `normal`/`confirm` подменяют GPU-вывод с прежней CPU-подготовкой; `final` пропускает прежние normal-команды и CPU-подготовку тоже. `opaque` и `blend` — дополнительные исследовательские controls, не pixel-equivalent кандидаты.
- `control-verification.json` — normal production build совпал с86 файлами выданного APK; прототип отсутствует в обычном bundle; подтверждено состояние debug-конфигурации.

Репродукция финального прототипа (по одному браузерному исследованию за раз):

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync('docs/qa/prepared-reveal-051/fixture.json','utf8'));
fs.writeFileSync('/tmp/prepared-reveal-fixture.json',JSON.stringify([fixture]));
const data=JSON.parse(fs.readFileSync('docs/qa/prepared-reveal-051/measurements.json','utf8'));
fs.writeFileSync('/tmp/prepared-reveal-conditions.json',JSON.stringify(data.batches.find(b=>b.name==='final').manifest.conditions));
JS
PROBE_BUILD=production PROBE_ROUNDS=3 PROBE_REPEATS=2 PROBE_DURATION=2400 \
PROBE_FIXTURE_FILE=/tmp/prepared-reveal-fixture.json \
PROBE_CONDITIONS="$(cat /tmp/prepared-reveal-conditions.json)" \
PROBE_OUTPUT=/tmp/prepared-reveal-final.json \
node scripts/audit-performance-probe.mjs
npx playwright test e2e/additive-alpha.spec.ts --workers=1
```

Для численной проверки используются frozen scene clock, реальные объекты Renderer и исходные текстуры. GPU readPixels вызывается только в отдельной quality-проверке до измерений. Снимки в650мс включаются условием `saveQualityFrames:true`; эти показы не входят в comparative performance. Растризация и sourcePixels/scratch подготавливаются до входа в измеряемое окно. Атлас присутствует у контроля и кандидата, это не измерение общего PSS обычного приложения.

Узкий прототип сохраняет36 кадров60Hz для400–1000мс и живые additive VFX. По цифрам и просмотренному кадру320px близок к исходнику, но имеет дополнительную память и не проходит performance gate. Общий вариант normal+additive256px не сохраняет смешивание текущего ADD на прозрачной подложке. Это не универсальная оценка sprite-sheet анимации на любом GPU.

`pack-prepared-reveal.mjs` собирает сохранённые `/tmp/prepared-reveal-{screen,normal,confirm,final,opaque,blend}.json` и результат browser-test `/tmp/prepared-reveal-alpha.json`. Failed/cancelled setup-попытки без полного набора проверок в данные не включены. Первые показы prepared-вариантов проходят после подготовки и quality — их нельзя называть холодным GPU.

Предварительные `screen/normal/confirm` сохранены как история экспериментов с hashes исходных JSON. Их ранняя реализация позднее заменена; текущий helper воспроизводит финальную ветку с пропуском старой CPU-подготовки. Не заявляется побайтовое восстановление ранних временных сборок. Финальные отрицательные gates пересчитываются из опубликованных rAF независимо от этого ограничения.
