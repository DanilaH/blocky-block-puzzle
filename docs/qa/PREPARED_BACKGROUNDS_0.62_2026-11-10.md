# Preview 0.62 — prepared backgrounds, complete celebration

The owner approved an ordinary-game candidate with the complete celebration restored and one short old/new comparison in the same APK. This follows the [isolated two-theme study](PREPARED_SURFACES_2026-11-10.md). That study's timing belongs to commit `2b7991d7e5cb3783be7d05d8832f7b1c5e173087`, not a claim that this final build is physically faster.

## Ordinary game

Boot keeps gameplay inert until the bounded asset preparation finishes, so the first input is accepted only after readiness. Diagnostic navigation also protects an unexported play capture.

Full Festival, ambient movement, reward captions, points flights, score count-up, theme reveal and haptics return to the ordinary default. The 0.61 compact path remains an explicit DEV control for regression/study only. There is no new user-facing effect-profile setting.

The prepared background controller now lives in `src/game/prepared-surfaces.ts`, not a DEV-only diagnostic import. Two generated page images (Porcelain / Polar Night) are decoded once before activation. Two reusable board siblings contain complete fills and the static well grid; the old layer fades and hides. The other nine themes retain flat color backgrounds. Existing cached tile materials remain separate.

Both images together are 19,304 encoded bytes and 12,580,152 estimated decoded RGBA bytes. No eleven-image preload is introduced. Any image error or decode timeout (2 seconds) falls back to the original page/board renderer; late decode completion cannot activate art later. A rapid interruption has at most two reusable snapshot canvases per surface; their pixel storage is zeroed after the fade settles. No new frame-by-frame painting loop.

Pause/background settles the saved theme, including interruption during the 320ms all-clear theme hold. This required resolving the held theme during inactivity, with immediate board/material updates. Resize and real WebGL context loss/restoration settle the prepared layers. Save/score/reward state still comes from the committed profile, independently of animations.

## One short comparison

Pause → Diagnostics → **Check background transition** (`?clearTrace=surfaces`). About 100 seconds: two warmups of at least8 seconds (bounded drain up to20 seconds each), then eight full 8-second measurements; 1.8 seconds setup per episode. Order: original/generated, generated/original, original/generated, generated/original. Both original-first and generated-first therefore have two repetitions.

Only page/board rendering changes. Every episode uses the same actual move/store/reward path, cosmetic seed, full legacy celebration and legacy score glow. The original branch detaches both prepared hooks and art nodes; generated reuses the predecoded pair and verifies both layer transitions actually ran. It does not compare reduced celebration against complete celebration.

There is **no CDP recording or preflight**, no screenshot/DOM dump and no trace ZIP. Existing native calls only hold the screen on, read device/WebView/thermal metadata and share bounded JSON. Native calls have 2-second limits. The report stores exact existing Float32 frame intervals for independent recomputation, seven metrics, proof counters and mode snapshots; export hard cap 900KB, not 150MB. Initial browser export was about94KB; physical size depends on RAF cadence.

A complete normal episode validates score/shown score1574, pending0, theme5, 148 spawned Festival particles, three reward DOM nodes, drained effects and the correct original/generated path. The ordinary profile and backup use a separate database and are never copied into the report.

A positive automatic verdict requires at least25% fewer rounded >33.4ms intervals in **both orders**, at least100 intervals/episode, stable references with at least2 long intervals, no worse max beyond1ms, and known unchanged device/WebView with no reported thermal pressure on SDK29+. Browser/fast/incomplete/invalid/unknown-device runs cannot become a physical win. Reduced-motion users get immediate prepared transitions in ordinary play; the diagnostic uses an isolated active-effect fixture.

Background, resize, context loss, Back or Cancel explicitly interrupt comparison. Partial reports cannot be accepted. A150-second deadline prevents an indefinite run. Result sharing errors leave the report available for retry; ordinary gameplay can always be reopened.

## Verification

Implementation checks:242 unit tests, TypeScript/Vite build, existing image checks,7 independent Python analyzer tests. First complete browser comparison:10/10 valid, every metric recomputed by the independent Python analyzer, ordinary save/backup unchanged, browser result explicitly not physical. Ordinary full celebration, calm/reduced motion, failed/late image decode, pause/background, delayed theme hold and real WebGL context loss/recovery are covered by browser checks.

Final browser regression, production-byte replay and Android signing/content verification are recorded below when complete. Physical POCO performance and human visual acceptance remain open. No phone smoothness or universal GPU fix is asserted from browser tests.

Replay:

```sh
npm ci
npm test
npm run build
npm run assets:check
npx playwright test --workers=1
node scripts/verify-prepared-production.mjs
python3 scripts/analyze-surface-comparison.py /tmp/blocky062-production/comparison.json
python3 scripts/test-surface-comparison-analyzer.py
```

## Final regression hardening
Hidden startup skips presentation refresh until the renderer exists; otherwise the inactivity handler could touch not-yet-initialized UI. The existing hidden-startup scenario reproduced that failure and now passes. Native device metadata explicitly marks emulators, which cannot receive a physical-win verdict. The short diagnostic has its own production WebView instrumentation covering background cancellation, all10 full episodes, unchanged ordinary database contents and actual small JSON sharing. CI selects this surface-specific native smoke; the original57+10 CDP runner remains available without `--surfaces`.

The historical score/filter browser comparison now uses the full production8-second window rather than its2.6-second functional shortcut: that shortcut intermittently sampled before both score-flight/glow callbacks. Its test deadline reflects ten full episodes; no production timing, acceptance threshold or animation duration was extended.

The first native cold software-GPU warmup produced only36 RAF intervals in8 seconds, with ~1.4s stalls; all148 particles spawned but their capped simulation had not drained. Warmups now may wait for actual effect completion up to20s, matching the prior diagnostic warmup policy. The eight measured windows remain8s; warmup completion time is exported separately. Ordinary boot may validly choose the documented original-renderer fallback after its2s image timeout, so the native fixture accepts either ready ordinary renderer before opening the explicit art comparison.

## Recorded-frame boundary
The final Android WebView run exposed a timer/RAF race: an8s timer returned with the last recorded RAF at7866.6ms, so a correct generated episode was rejected as `measurement-window`. This was not an effect-contract failure. Capture now establishes its RAF anchor before the move and waits, with cancellation and a2s bound, for the recorder itself to cross the closing boundary. Exact8s interval selection, original/candidate order and acceptance thresholds are unchanged. The closing interval, including any stall, remains in the exported metrics. Unit checks cover the delayed-recording case, missing-frame timeout and background cancellation.

## Delivered preview verification — 10 November 2026

Source head: `ea78628dd9ca0ed36b4ba2a5b1c8c803428c35ce`; PR build merge: `2d37098b507c7d49d1565300be0061af8d7e5bcf`; source tree: `01bcfe1e77f9d26a7856a6ae6cb458fce44e43e3`. [CI run42802898179](https://github.com/DanilaH/blocky-block-puzzle/actions/runs/42802898179).

- 244 unit checks, build/assets checks and7 independent surface-analyzer cases passed.
- All25 focused browser scenarios passed on this head, including the complete eight-second comparison, both startup barriers, restored celebration, lifecycle recovery, failed/late images and one game canvas.
- Android unit/build and production WebView instrumentation passed:2 tests, all10 old/new episodes valid, cancellation explicit, ordinary save records unchanged, actual exported JSON below900KB. The independent analyzer recomputed every metric and returned valid/completed with no errors.
- The retained full232-scenario browser regression is still running at delivery. It has no final success claim here. The prior1bf run was superseded/cancelled after its native timing-race finding.
- The Android35/WebView124 software emulator is a functional check. Its descriptive long-interval means were89→96.5 in original-first and101.5→104 in generated-first; this run supplies no acceleration evidence. It is explicitly marked nonphysical and cannot pass the physical verdict. The earlier isolated prototype's faster timings are not the result of this APK.
- Physical POCO performance and visual acceptance remain open.

The signed APK is11,743,560 bytes, SHA-256 `e3416ccd39c59b5b9d8b2bdfc7a4802e8fb9f59238b1fc2702f69f715a6627c7`. Package `com.danilah.blocky.dev`, version62 /0.62.0-preview. APK v2 signing verified; certificate `e96d961e605c768113f398ccca8bf3e93aaed52ddb48c5d0c9b3f259f5fdbe13` matches0.61. All99 production files byte-match the build output; only the known Cordova bridge extras are additional. [Machine-readable verification](prepared-backgrounds/apk-verification.json).

Delivery: `blocky-0.62-preview.zip`,11,042,834 bytes, contains one `app-debug.apk`. Extract and install over0.61. The local execution host became unavailable; the exact verified GitHub artifact was retained for delivery instead of relabelling ZIP bytes as an APK.

Run once: **Пауза → Диагностика → Проверить переход фона → Начать сравнение**. Typically around100seconds, cold warmup may take about2minutes. Then **Отправить результат** exports the bounded JSON. No system-setting changes, CDP preflight or large recording.
