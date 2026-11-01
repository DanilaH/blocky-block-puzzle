# Preview 0.29: remaining-spike investigation

Baseline source: 1771e9db. Software Chromium, portrait 390×844 DPR2. These measurements are not Android GPU timings or evidence of improved phone FPS.

## Material and layer isolation

Same six-line clear at series 5→6, then dragging a surviving piece; one run per condition with Chrome tracing enabled. Full source data: [ablations.json](performance-0.29/ablations.json).

| Condition | Drag RAF p95, ms | Longest observed main-thread long task, ms |
|---|---:|---:|
| Full | 33.5 | 108 |
| Both material blends disabled | 33.4 | 88 |
| DOM material blend disabled | 33.4 | 99 |
| Board material blend disabled | 33.4 | 64 |
| Ambient and festival canvases both stopped | 33.5 | 93 |

Single runs do not establish the magnitude of a speedup. Spikes persist in every condition. Removing both overlay canvas updates does not eliminate them; neither does eliminating material blending. Keep all production effects and smooth transitions. The preceding [trace analysis](PERFORMANCE_FOLLOWUP_2026-11-01.md) found browser Commit dominated the largest tasks. No evidence yet supports a major rendering rewrite or a reduction of effect budgets.

Reproduce: `BLOCKY_TRACE=1 BLOCKY_MODES=full,no-material-blend,no-dom-blend,no-board-blend,no-overlay-canvases BLOCKY_TAG=materials029 node scripts/compare-performance.mjs`. Ablations are test-only monkey patches, not shipping switches. RAF metrics cover drag; tracing and long-task observation include placement too.

## Diagnostic export

0.29 includes the previous bounded phase ring and session aggregates. Schema 3 adds up to 128 placement markers (line count, series, all-clear, calm setting) and up to 128 browser long-task start/duration pairs. No board, player identifier or save content is exported. Long-task observation only runs while opt-in recording and gameplay are active; unsupported WebViews report `longTaskSupported: false`. Restart clears all records; pause disconnects the observer, stale callbacks are ignored. All timestamps use performance.now.

Fixed Android export filename: it no longer claims version 0.27. The shared file is `blocky-performance.json`; its JSON carries the actual app/schema versions.

Record on device: Pause → Диагностика → Записать плавность игры. Play normally, including dragging during a clear. Pause → Диагностика → Выгрузить замер. Save/export wait is labelled wall time, not CPU. This captures CPU long tasks and RAF gaps, not GPU duration.

## Lifecycle stress

`scripts/soak-performance.mjs` repeatedly injects deterministic fixtures into the live store while paused, then uses actual placement/drag/pause controls. It alternates full-board and six-line clears, series 0/5/19/99, and restarts through the real menu every ten cycles. One loaded page, no reload between cycles. Every ten cycles it collects garbage and records heap, DOM/listener counts, animation count, sprite pools, particle/audio counts and shared visual-clock subscriptions. HMR is disabled to keep source edits from resetting the session.

This synthetic test does not replace the specification's 30-minute physical-device playtest, native audio focus, vibration or ad testing. Completed 60 cycles and six real restarts in one loaded page with no page errors. [Raw stress samples](performance-0.29/soak.json). All paused samples: 0 shared-clock subscribers, 0 festival sparks, 0 tracked audio voices; 3 canvases, 768 tile sprites and 1309 scene children throughout. Post-GC JS heap: 24,688,012 bytes after first cycle; 25,159,232 after cycle 60. DOM/listener counts fluctuate rather than grow monotonically. These samples do not establish the absence of all native/browser leaks. The first development run was interrupted by HMR during source editing after 40 cycles; only the clean rerun with HMR disabled is included.

## Validation

93 unit tests and TypeScript/Vite build passed locally. Seven targeted browser tests passed and cover placement, strict drag layout reads, diagnostic export and material transitions. Complete CI and APK checks pending at source publication.
