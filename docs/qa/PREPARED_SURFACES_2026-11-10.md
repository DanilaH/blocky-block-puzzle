# Prepared theme surfaces — 10.11.2026

Implemented at the owner's request: generated backgrounds and prepared surfaces blended by opacity while preserving the complete celebration. Isolated experiment based on `feat/classic-preview` at `e01e48ff50719fc77a443034ce693cbcf9644ead`; default 0.61 and Android version are unchanged. No physical-device acceptance or APK is claimed.

## What actually changes

- Page backgrounds already had two opacity layers. Tile materials already blended cached, preloaded sprites by alpha. Root/body had no active background-color fade in the final CSS cascade. This study does not claim to invent those optimizations.
- The remaining `#board` CSS background-color interpolation is bypassed. Two fixed siblings under the real Phaser canvas contain the target and previous board fills/well grids. Only the previous layer's opacity animates; it is hidden and released at completion. No extra JavaScript frame loop is added.
- `themeSurfaces=flat` uses the same prepared board path and flat page backgrounds. `themeSurfaces=generated` also replaces two page backgrounds with decoded, reusable images. Other themes retain flat fallback colors. [Asset origin and prompts](../../assets-src/theme-surfaces/README.md).
- Full original Festival, ambient animation, DOM rewards, HUD flashes, points flights, material fade, theme notices and theme impulse remain enabled. Local text/color fades are not optimized by this study. Score glow is explicitly controlled to `legacy` for every measurement.
- Normal transitions use one visible layer when settled, two while fading. A rapid interruption takes a single raster snapshot of the currently blended surface; at most two reusable snapshot canvases per surface, approximately 4.2M pixels each, cap DPR at 3. This rare interruption is not free and does not prove zero painting cost. Page stripe rasterization during an interruption is approximate decoration.
- Pause settles to the target immediately and cancels the old completion callback. Resize also settles. Snapshot canvases are siblings of `#board`, so existing `#board canvas` selectors still select the sole real game canvas.

## Full-cycle comparison

Linux Chromium 141.0.7390.37, ANGLE Vulkan SwiftShader, viewport 392×872, DPR 2.75. Board backing 1024×1024; original Festival/ambient each 588×1308. These are software graphics measurements, not POCO or GPU execution timings.

Independent browser contexts in order: original → flat → generated → generated → flat → original. Each context: two warmups then two untraced measurements of the same full 8-second event. Total 24 valid episodes, including 12 measured episodes. All seven frame metrics independently recomputed from saved intervals for every episode in both Node and Python: 168 checked metric values. Source SHA-256 fingerprints verified after measurement.

| Variant | Mean RAF interval, ms¹ | >33.4 ms counts per measured episode² | Sum | Worst interval, ms |
| --- | ---: | --- | ---: | ---: |
| Original full celebration | 20.934 | 13 / 25 / 14 / 24 | 76 | 250.1 |
| Prepared flat surfaces | 19.293 | 14 / 14 / 17 / 13 | 58 | 299.9 |
| Prepared surfaces + generated art | 18.379 | 10 / 10 / 10 / 12 | 42 | 83.4 |

¹ Arithmetic mean of the four episode means; do not treat this as a measured GPU time or physical display FPS. ² Established protocol rounds intervals to 0.1 ms before applying >33.4; raw threshold, >34, >50, p95, max and interval counts are retained separately in the JSON.

Generated candidate versus original: mean interval −12.2%; rounded long intervals −44.7%. Both orders improve: first 38→20, reverse 38→22. This single session supports retaining the generated candidate. It does not establish why it improved: art, paint/composition changes, browser caching, and run variance are not isolated GPU causes. Flat surfaces alone retain a worse 299.9 ms outlier, and the generated candidate still has 83.4 ms stalls. No universal performance fix is declared.

[Compact results, state proofs and source hashes](PREPARED_SURFACES_2026-11-10.json). Raw per-frame samples are retained outside git; no large phone traces are added.

Every episode validates: full legacy profile, 148 Festival particles spawned, three reward DOM nodes created, score/shown score 1574, pending points zero, theme 5 saved/rendered, effects drained and exactly one real game canvas. Candidate surfaces end with one visible layer each, no animation and no snapshot allocation in the ordinary event. Generated art uses two decodes total, 19,304 encoded bytes / 12,580,152 estimated decoded RGBA bytes. These are resource counters, not process/GPU memory measurements.

## Verification and replay

- 236 unit tests, TypeScript/Vite production build and existing asset checks pass. Initial sparse-checkout omissions of Android/vendor metadata were restored; those setup failures are not app regressions.
- Six new browser scenarios cover both full celebrations, pause in each mode, pixel continuity across interrupted alpha fades with bounded buffers, and rapid board changes/resize preserving the real canvas. Existing Festival (2), tile material (3) and static board (1) checks also pass: 12 relevant unique scenarios.
- The alpha test originally used the Playwright timer clock for WAAPI completion, which is not the same clock. It now sets native animation currentTime for pixel checks and awaits native completion; no app timeout was extended or transition forcibly finished in that assertion.
- Production JavaScript contains no prepared-surfaces import or `themeSurfaces` path. This DEV-only candidate does not change the 0.61 default; full celebration is explicitly requested in the study URL.
- Separate visual capture shows Porcelain → Polar Night with the full celebration. Recording is excluded from timings; diagnostic controls are hidden only in that visual clip. It is not a phone recording or evidence of physical smoothness.

```bash
npm ci
npx playwright install chromium
node scripts/study-prepared-surfaces.mjs
node scripts/record-prepared-surfaces.mjs
npm run dev
# /?clearTrace=full&effectsStudy=legacy&themeSurfaces=generated
# /?clearTrace=full&effectsStudy=legacy&themeSurfaces=flat
```

Promotion remains open: phone acceptance, final visual approval, all-theme cache/residency policy, image decode failure fallback, context loss/recovery, lifecycle integration and reduced-motion coverage. Do not expand eleven full-screen art decodes or ship a new APK just from a software-rendered win.
