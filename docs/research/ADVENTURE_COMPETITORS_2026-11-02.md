# Кампании блок-пазлов — исследование 02.11.2026

Метод: официальные справки, карточки разработчиков в магазинах и доступные отдельные отзывы. Это документальное сравнение, не плейтест актуальных мобильных сборок. Утверждения из карточек не доказывают фактическую доступность функции во всех версиях/регионах. Не смешивать две разные игры Block Blitz.

| Игра | Подтверждение | Вывод для проектирования |
|---|---|---|
| Tetris Block Blast, PLAYSTUDIOS | Справка описывает сбор камней/жемчуга, ящики с письмами, кофемашины с чашками, ключи и замки; ключи могут приходить на фигурах | Многоступенчатые цели меняют планирование и требуют предметной выдачи |
| Block Blitz: Gems Puzzle, OVIVO, com.ovivogames.blockblitz | Разработчик заявляет Journey, специальные уровни с бабочками, молоток, reroll и поворот | Предметные задачи и инструменты добавляют варианты решения; точные правила бабочек не установлены |
| Block Blitz: Puzzle Adventure, Bluetile, com.playgames.block | В карточке заявлены бомбы, радужные клетки и препятствия | Альтернативные очистки расширяют механику; исключительность этих функций для кампании не подтверждена |
| Block Journey, HungryStudio | Отдельный Journey Mode с иллюстрациями и пазловым визуальным прогрессом | У главы должен быть видимый результат за пределами поля |
| Block Blast!, Hungry Studio | Adventure с уровнями; события со сборкой изображения по частям | Иллюстрация может объединять задачи общей наградой; событие не равно постоянной кампании |

Источники:

- [PLAYSTUDIOS: What are Targets?](https://playstudios.helpshift.com/hc/en/23-tetris-block-blast/faq/3373-what-are-targets/?contact=1&p=ios)
- [PLAYSTUDIOS: High Score / Adventure](https://playstudios.helpshift.com/hc/en/23-tetris-block-blast/faq/3372-what-is-the-difference-between-high-score-mode-and-adventure-mode/)
- [PLAYSTUDIOS: boosters](https://playstudios.helpshift.com/hc/en/23-tetris-block-blast/faq/3354-how-do-boosters-work/?hpn=1&p=web)
- [OVIVO: Google Play](https://play.google.com/store/apps/details?hl=en_US&id=com.ovivogames.blockblitz)
- [Bluetile: Google Play](https://play.google.com/store/apps/details?id=com.playgames.block)
- [Block Journey: Google Play](https://play.google.com/store/apps/details?id=com.hungrystudio.block.puzzle.fun.brain.free)
- [Block Blast!: App Store](https://apps.apple.com/us/app/block-blast/id1617391485)

Отдельные отзывы на странице Block Journey описывают сброс прогресса; на странице OVIVO — случайное применение помощи возле лотка и чрезмерные рекламные паузы. Они дают сценарии UX-проверки, но не частоту дефектов, доказанный алгоритм выдачи или статистику всей аудитории. Не делать вывод о намеренно непроходимых уровнях на основании таких жалоб.

Для нас: первый набор предметы + лёд + ключи/замки; далее генератор и усилитель. Конкретное устройство льда и замков — наше проектное решение, не подтверждённая копия Hungry. В пилоте не вводить валюту, магазин, жизни или сброс глав. Пять уровней проверяют механики и понятность, затем одна глава 20–30 уровней. Подробный контракт: [ТЗ кампании](../ADVENTURE_SPEC_2026-11-02.md).
