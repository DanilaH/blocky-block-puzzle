# Сборка и границы preview

Node 24, зависимости зафиксированы package-lock.json. После клонирования:

```sh
npm ci
npm test
npm run build
npm run dev
```

Браузерные проверки:

```sh
npx playwright install chromium
npm run test:e2e
```

Android: JDK 21, Android SDK 36, build-tools 36.0.0. На Linux/macOS:

```sh
npm run android:sync
cd android
./gradlew assembleDebug
```

APK: android/app/build/outputs/apk/debug/app-debug.apk. Workflow `Preview checks and APK` сначала проверяет web/unit, затем собирает debug APK и сохраняет artifact на 14 дней. Это debug-подпись CI, не ключ выпуска. Установка артефактов разных запусков может потребовать удаления прежней debug-сборки; данные тогда теряются. До широкой раздачи завести постоянную тестовую подпись.

Временный собственный package: com.danilah.blocky.dev. Production package и ключ подписи не выбирались. Встроен Capacitor App для Back/appStateChange. Сохранение пока через IndexedDB WebView; атомарность транзакций проверяется отдельно от сохранности на физических Android. Android backup выключен, облачного восстановления не обещаем.

В preview работают правила Classic, перенос, подсказка worker, локальное сохранение, пауза, правила, новая партия, результат, SFX и спокойные эффекты. Это не законченный первый APK из M1: нет нативной рекламы, reward/revive, аудиофокуса, полноценного обучения, второй темы, музыки, аналитики и проверки на реальном телефоне. Пустая нижняя область — резерв под баннер, не загруженное объявление. Бесплатные подсказки — 3 в день; после исчерпания честное сообщение, без фиктивного rewarded.

Основной прототип использует initial-v1. Экспериментальная solvable-v1 и доказательство тройки доступны в модуле core для дальнейшего сравнения; UI выбора алгоритма не нужен обычному игроку. Длительность сессий и релизная выдача не утверждены.

Проверены первичные справки при подготовке: https://capacitorjs.com/docs/getting-started/environment-setup, https://capacitorjs.com/docs/updating/8-0, https://docs.phaser.io/phaser/concepts/input. Конкретные зависимости проверены через npm registry и закреплены lockfile.
