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
