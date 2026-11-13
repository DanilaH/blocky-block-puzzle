# Ассеты preview и происхождение

- Поле: собственная геометрия Phaser. Блоки: собственные generated RGBA masters plastic/enamel/chrome, `assets-src/tile-study/`, происхождение и запросы рядом. Production: 18 подготовленных WebP, без bitmap конкурентов.
- Иконки интерфейса: собственные простые inline SVG.
- Шрифт: системный стек, шрифтовые файлы не распространяются.
- SFX: собственный процедурный синтез (audio.ts), исходных аудиофайлов нет. Пока прототип, не финальный набор.
- Android launcher/splash: стандартные временные ресурсы шаблона @capacitor/cli 8.5.3. MIT notice сохранён в licenses/CAPACITOR-MIT.txt. Не считать их утверждёнными иконкой и стартовым экраном магазина; заменить перед выпуском.
- docs/qa/*.png: собственные скриншоты работающего web-прототипа, fixture описан в QA.
- Код mini-games-kit: происхождение и ограничения лицензирования в KIT_REUSE.md; внешнюю лицензию на него не заявляем.

Перед релизом отдельно собрать notices всех реально поставляемых зависимостей и окончательных ассетов. Этот список относится к preview.

- Кампания 0.35: original generated Crystal Cove и четыре предмета, masters/промпты `assets-src/adventure/README.md`, runtime WebP `public/adventure/`, offline preload и encoded/RGBA checks.

## 0.42: original reward emblems
Две самостоятельные generated эмблемы — полная очистка и завершение серии 10+. [Мастера, происхождение и обработка](../assets-src/rewards/README.md). Runtime WebP: 45,394 bytes total, 722,304 decoded RGBA. Сохранены alpha/trim metadata; проверка входит в assets:check. Фоны, кнопки и кольцо остаются кодовыми, текст не запекается в картинки.

## D68: два фона для изолированной DEV-пробы
Собственные generated Porcelain / Polar Night, без внешних референсов. Runtime — два opaque WebP793×1983, вместе19,304байта и12,580,152 estimated RGBA bytes. Остальные темы имеют плоский fallback, все одиннадцать картинок не предзагружаются. [Запросы и бюджет](../assets-src/theme-surfaces/README.md).
