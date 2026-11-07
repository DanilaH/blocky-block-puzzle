# Performance probe 0.47

Read `../PERFORMANCE_DIAGNOSIS_0.47_2026-11-07.md` first. These are synthetic fixture measurements on Chromium/SwiftShader, not phone FPS or human playtesting. Use the repository's pinned dependencies. All commands run from the repository root, sequentially; do not run multiple browser batches concurrently.

The harness injects hooks through a Vite plugin in memory. It does not edit game sources. Production diagnostics build to `/tmp/blocky-probe-production`, not the shipped dist. Audio is muted; no real ads are requested. Each condition gets a new browser context, then repeats in the same page/GL context. Reset transitions settle for 2100 ms. Default observation is 2200 ms; trace runs use 3500 ms. Three rounds alternate condition order. Cosmetic randomness is unseeded. First-in-context does not clear global shader caches.

## Reproduce

```sh
PROBE_OUTPUT=docs/qa/performance-probe-047/screen-dev.raw.json node scripts/audit-performance-probe.mjs

PROBE_CONDITIONS='[{"kind":"allclear","units":0},{"kind":"allclear","units":1},{"kind":"allclear","units":2},{"kind":"allclear","units":4},{"kind":"allclear","units":0,"androidUA":true}]' PROBE_OUTPUT=docs/qa/performance-probe-047/textures-dev.raw.json node scripts/audit-performance-probe.mjs

PROBE_CONDITIONS='[{"kind":"allclear","units":0},{"kind":"allclear","units":0,"noRender":true},{"kind":"allclear","units":0,"noFestival":true},{"kind":"allclear","units":0,"noAmbient":true},{"kind":"allclear","units":0,"noVfx":true},{"kind":"allclear","units":0,"noInk":true}]' PROBE_OUTPUT=docs/qa/performance-probe-047/layers-dev.raw.json node scripts/audit-performance-probe.mjs

PROBE_BUILD=production PROBE_CONDITIONS='[{"kind":"allclear","units":0},{"kind":"multi","units":0},{"kind":"allclear","units":0,"noVfx":true},{"kind":"allclear","units":0,"noInk":true}]' PROBE_OUTPUT=docs/qa/performance-probe-047/layers-production.raw.json node scripts/audit-performance-probe.mjs

PROBE_TRACE=1 PROBE_DURATION=3500 PROBE_ROUNDS=1 PROBE_REPEATS=2 PROBE_CONDITIONS='[{"kind":"allclear","units":0},{"kind":"multi","units":0},{"kind":"allclear","units":0,"noRender":true}]' PROBE_OUTPUT=docs/qa/performance-probe-047/traced.raw.json node scripts/audit-performance-probe.mjs

node scripts/performance-probe/summarize.mjs
```

`units:0` retains Phaser's actual default; it does not override the mobile branch. Android UA changes engine detection, not the hardware. `noRender` is a deliberately blank scene with update and external layers still active. `noVfx`/`noInk` hide the layer after its JS properties are updated. None are shipping solutions. `allclear-no-theme` freezes presentation only; saved state/wardrobe still advance.

`rafSeries` stores `[milliseconds from trigger-window start, interval ms]`. `phaseBins` assign intervals by their end timestamp and are approximate. `over25` is an operational threshold for this 60-Hz test, not a universal display budget. Renderer CPU spans time command submission, not GPU completion. Trace spans can nest: their totals are not additive. The detailed trace comparison is separate from untraced performance results.

Full `.raw.json` and `.trace.json.gz` are intermediate captures; compact `measurements.json` preserves every episode's rAF series, GL counts, manifest and outcome. `trace-summary.json` retains selected spans from the trace runs. No hidden archive upload is needed for the experiment to run.
