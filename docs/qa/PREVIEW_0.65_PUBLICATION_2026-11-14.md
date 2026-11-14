# Поставка preview0.65 —14.11.2026

APK собрана из source0caa45d4f5be48ba9917089e8f4b702a71b5367f,
CI merge3d5efe968d5df66b8a49cb794ee6f4cd6ed45859; обе версии имеют
точное деревоfb69af8227ee98029c9473e3d33fb8f94a6eb2c3. Локальные
804b1d3/c83e120 сохраняют обе истории и то же дерево. Старый main не база.
Обычный Git повторно завершился «could not read Username»; использована
ранее разрешённая владельцем API-публикация целого UTF-8 дерева. Без blob
API/base64/файлов по частям; исходных записей/ключей/бинарников в Git нет.

## Готовый APK

- Package com.danilah.blocky.dev, versionCode65,0.65.0-preview.
-11790952 bytes; SHA256
  `712c2f605a54a99e9b8e01ca22272ba14f37bb9cb01b1a3795cca4af470d896c`.
- Прежний signer
  `e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13`.
  Официальный apksigner36 v2 VERIFY; удаление приложения не требуется.
- APK artifact14128382021, SHA256 ZIP
  `ee0a434a5dc4a7a18452c6fce8bf5a232089d0b775538b7c40925a483b8ae6ff`.
  Proof artifact14128242865, SHA256 ZIP
  `310e851c3e51ef47222dc350b0401a4d29cd27af79289d54bb5d62ecd1918bf8`.
  Оба скачанных архива сверены с Actions digest перед извлечением.
- Независимый повторный production build с VITE_SOURCE_COMMIT=CI merge:
  все99 web-файлов APK равны байтам dist; локальный proof полностью равен CI.
- AAPT2: ads_test_mode=true, appmetrica_api_key="", все live ad units="".
  Demo/off, не проверенная доставка в кабинет и не production показы.
- APK и короткая инструкция сохранены для владельца; сама APK не коммитится.

## Проверки

[Actions PR1 run43631030232](https://github.com/DanilaH/blocky-block-puzzle/actions/runs/43631030232).

-339 unit/TypeScript/build PASS локально и в CI.5 Python metrics и3 pure JVM
  ILRD tests PASS локально. Android unit/assemble и подпись PASS в CI.
-25 focused effects job132557449218 PASS.
-2 Android emulator instrumentation job132558138126 PASS.
-7 targeted browser PASS локально; полный245 browser PASS в CI (22.0мин).
-457 old recorded moves exact hashes + independent geometry PASS.
-96 frozen bot launches/11992 moves и10мин synthetic lifecycle210 циклов:
  [результат с ограничениями](COMPOSITION_V2_0.65_2026-11-14.md).

Default director-v2, audience rollout OFF. Новый composition-v2 manual only,
HOLD по нестабильному long-tail; старый composition-v1/v2 не переопределён.
Телефон: update/resume, demo show/reward/return, длинная сессия/thermal/lag.
Человек: интерес старта, ранняя теснота, скука/длительность и возврат к игре.
AppMetrica кабинет/доставка отложены владельцем. mini-games-kit не менялся.

Воспроизведение synthetic soak (не телефон):
```bash
BLOCKY_MINUTES=10 BLOCKY_SOAK_DEALER=composition-v2 \
BLOCKY_SOAK_OUTPUT=/tmp/blocky-soak065.json \
BLOCKY_SOAK_CHECKPOINT=/tmp/blocky-soak065-checkpoint.json \
node scripts/commercial/soak.mjs
```
