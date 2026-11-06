# Remaining spikes: controlled investigation, 2026-11-01

Baseline: 0.28, commit 2b758bca. Chromium software renderer, 390×844, DPR2.
One run per condition; descriptive evidence, not a statistically established speedup or Android FPS.
Fixture: six-line clear at series 5→6 (plastic→enamel), followed by dragging the surviving piece during effects. Idle drag is a separate control.

| Condition | Longest renderer task, ms | Nested browser Commit, ms |
|---|---:|---:|
| Full effects | 105.161 | 79.365 |
| Idle drag | 22.042 | 20.402 |
| Festival particles stopped | 96.060 | 72.986 |
| Ambient drawing disabled | 90.092 | 69.657 |
| CSS filters disabled | 98.882 | 77.576 |

In the next two largest full-effect tasks, Commit accounts for 75.007/91.825 ms and 62.921/72.628 ms. Main-thread game logic alone therefore does not explain these observed stalls. Commit duration includes browser/compositor synchronization and is not a GPU timer. Disabling each visual subsystem individually does not eliminate the stalls. No production visual effects were removed; material-transition and GPU-driver contributions remain unisolated.

## Reproduce

Run `BLOCKY_TRACE=1 node scripts/compare-performance.mjs` for full and idle controls. Run `BLOCKY_TRACE=1 BLOCKY_MODES=no-festival,no-ambient,no-filters node scripts/compare-performance.mjs` for isolated diagnostic ablations. JSON metrics go to `/tmp/blocky-compare-current.json`; Chrome traces to `/tmp/blocky-trace-<mode>.json`. Copy outputs before repeating; traces are large and intentionally not committed. Tracing itself adds overhead. Metrics sample the drag interval; traces also include placement. Compare like windows, not aggregate totals across the two.

## Changes shipped in source

- Opt-in phase records use a bounded circular buffer instead of shifting 512 entries on each draw.
- Lifetime per-phase count/total/mean/max survives eviction of individual records; maximum 32 phase names. Restart clears both rings and summaries.
- Frame timestamps share the performance.now clock with phase timestamps, permitting correlation of a slow RAF interval with placement/render/save work. Snapshot arrays and summaries are detached copies.
- `placementRender` is timed separately. Asynchronous commit/save remains explicitly labelled wall time, not CPU.
- Diagnostic export schema is 2; application version remains 0.28. Existing APK does not contain this follow-up.
- Trace capture and explicit ablation selection are available in the checked-in profiling script, never in the production game.

Validation: 92 unit tests; production TypeScript/Vite build; four placement-performance browser scenarios. Tests cover wrap order, retained summaries, snapshot independence, reset, invalid durations, storage bounds, inactive gaps, and exported timestamp alignment.

## Still open

A physical Android capture (pause → Diagnostics → Record → play → export) is still required to determine whether actual-device stalls have the same origin. Do not call this a measured FPS improvement. Next evidence-driven investigation: GPU/compositor timing and material blend overlap on the target device. No new APK was assembled for this diagnostics-only follow-up.
