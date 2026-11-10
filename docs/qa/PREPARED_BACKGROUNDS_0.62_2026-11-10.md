# Preview 0.62 — prepared backgrounds, complete celebration

The owner approved an ordinary-game candidate with the complete celebration restored and one short old/new comparison in the same APK. This follows the [isolated two-theme study](PREPARED_SURFACES_2026-11-10.md). That study's timing belongs to commit `2b7991d7e5cb3783be7d05d8832f7b1c5e173087`, not a claim that this final build is physically faster.

## Ordinary game

Boot keeps gameplay inert until the bounded asset preparation finishes, so the first input is accepted only after readiness. Diagnostic navigation also protects an unexported play capture.

Full Festival, ambient movement, reward captions, points flights, score count-up, theme reveal and haptics return to the ordinary default. The 0.61 compact path remains an explicit DEV control for regression/study only. There is no new user-facing effect-profile setting.

The prepared background controller now lives in `src/game/prepared-surfaces.ts`, not a DEV-only diagnostic import. Two generated page images (Porcelain / Polar Night) are decoded once before activation. Two reusable board siblings contain complete fills and the static well grid; the old layer fades and hides. The other nine themes retain flat color backgrounds. Existing cached tile materials remain separate.

Both images together are 19,304 encoded bytes and 12,580,152 estimated decoded RGBA bytes. No eleven-image preload is introduced. Any image error or decode timeout (2 seconds) falls back to the original page/board renderer; late decode completion cannot activate art later. A rapid interruption has at most two reusable snapshot canvases per surface; their pixel storage is zeroed after the fade settles. No new frame-by-frame painting loop.

Pause/background settles the saved theme, including interruption during the 320ms all-clear theme hold. This required resolving the held theme during inactivity, with immediate board/material updates. Resize and real WebGL context loss/restoration settle the prepared layers. Save/score/reward state still comes from the committed profile, independently of animations.

## One short comparison

Pause → Diagnostics → **Check background transition** (`?clearTrace=surfaces`). About 100 seconds: two full 8-second warmups, then eight full 8-second measurements; 1.8 seconds setup per episode. Order: original/generated, generated/original, original/generated, generated/original. Both original-first and generated-first therefore have two repetitions.

Only page/board rendering changes. Every episode uses the same actual move/store/reward path, cosmetic seed, full legacy celebration and legacy score glow. The original branch detaches both prepared hooks and art nodes; generated reuses the predecoded pair and verifies both layer transitions actually ran. It does not compare reduced celebration against complete celebration.

There is **no CDP recording or preflight**, no screenshot/DOM dump and no trace ZIP. Existing native calls only hold the screen on, read device/WebView/thermal metadata and share bounded JSON. Native calls have 2-second limits. The report stores exact existing Float32 frame intervals for independent recomputation, seven metrics, proof counters and mode snapshots; export hard cap 900KB, not 150MB. Initial browser export was about94KB; physical size depends on RAF cadence.

A complete normal episode validates score/shown score1574, pending0, theme5, 148 spawned Festival particles, three reward DOM nodes, drained effects and the correct original/generated path. The ordinary profile and backup use a separate database and are never copied into the report.

A positive automatic verdict requires at least25% fewer rounded >33.4ms intervals in **both orders**, at least100 intervals/episode, stable references with at least2 long intervals, no worse max beyond1ms, and known unchanged device/WebView with no reported thermal pressure on SDK29+. Browser/fast/incomplete/invalid/unknown-device runs cannot become a physical win. Reduced-motion users get immediate prepared transitions in ordinary play; the diagnostic uses an isolated active-effect fixture.

Background, resize, context loss, Back or Cancel explicitly interrupt comparison. Partial reports cannot be accepted. A150-second deadline prevents an indefinite run. Result sharing errors leave the report available for retry; ordinary gameplay can always be reopened.

## Verification

Implementation checks:242 unit tests, TypeScript/Vite build, existing image checks,6 independent Python analyzer tests. First complete browser comparison:10/10 valid, every metric recomputed by the independent Python analyzer, ordinary save/backup unchanged, browser result explicitly not physical. Ordinary full celebration, calm/reduced motion, failed/late image decode, pause/background, delayed theme hold and real WebGL context loss/recovery are covered by browser checks.

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
