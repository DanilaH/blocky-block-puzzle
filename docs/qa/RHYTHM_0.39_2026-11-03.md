# Preview 0.39 — rhythm and board-wrapping reveal

Baseline: 0.38, f46fab7351104e851c141cb52ebc08a01eea2525. Scope approved by owner: ring layering; quieter opening, buildup/relief cycle, three supported refills after successful revive. No deliberate losing trays or ad-dependent difficulty before defeat.

## Implementation
- Frozen flow-v2 retained for saved games; new default flow-v3. Rhythm is persisted with the move and sent through the existing refill worker.
- Pressure rises by at most 14 per accepted move, falls by at most 18; based on occupancy and a drought of ordinary clears. Crossing 55 starts up to 18 moves of relief, stopped early by all-clear. This holds assistance through ordinary clears so the player can finish cleanup; it is not an all-clear timer or guarantee. All-clear reduces pressure to one quarter.
- Empty board starts with zero deliberate all-clear bonus. Geometric construction and route safety remain; all support levels have a replayable three-piece route or safe singles fallback. Player decisions can still block the remainder.
- Revive retains the visible 3×3 deletion and remaining tray. Its prepared effect includes three recovery refills (support floors 1.0, 0.8, 0.6), consumed on refill rather than by time or single moves. Natural board pressure may provide stronger support. The bonus does not repair arbitrary choices within the old tray; this is measured separately. Duplicate/late rewards keep their existing atomic semantics.
- Falling reveal uses one rear SVG path per active ring beneath the board and the existing foreground canvas for the front arc. Same age, center and radii; pointer events disabled; pause/resize/expiry clear the path. No extra canvas backing store.

## Validation status
Completed: 137 unit tests, 118 browser tests, assets/build, Android unit/build, 800 paired-policy games and 58 paired revive comparisons. Physical Android and human feel remain unverified for this build.

## Tuning separation
Three exploratory variants on indices 101–130 (seed=index×1777). The first suppressed full clears too much; support stopped as soon as initial lines were cleared. Added limited relief persistence and earlier pressure response. An initial check on indices 30001–30100 exposed more early random-player defeats: restored the v2 early large-piece restriction without restoring its all-clear bonus. Final comparison uses disjoint indices 40001–40100, four independent players, same seeds for v2/v3 and 120-move cap. Optional post-defeat revive follow-up is separate from pre-defeat metrics.

## Final held-out balance

100 paired seeds per strategy/policy; indices 40001–40100 × 1777, cap 120 moves. 800 games total, plus separate 24-move post-defeat recovery follow-ups. Survivors are censored. Raw per-move occupancy/pressure/clear timings: `rhythm-0.39/simulation.json.gz`; aggregates: `summary.json`.

| Player | Policy | Defeats / 100 | All-clears | Clears in first 6 moves | Games with any all-clear | Median first clear, conditional |
|---|---|---:|---:|---:|---:|---:|
| random | flow-v2 | 99 | 0 | 0 | 0 | None |
| random | flow-v3 | 100 | 0 | 0 | 0 | None |
| greedy | flow-v2 | 36 | 733 | 172 | 95 | 3 |
| greedy | flow-v3 | 16 | 196 | 18 | 73 | 23 |
| imperfect | flow-v2 | 68 | 114 | 72 | 46 | 3.0 |
| imperfect | flow-v3 | 42 | 27 | 9 | 18 | 7.5 |
| planner | flow-v2 | 2 | 1133 | 181 | 100 | 3.0 |
| planner | flow-v3 | 1 | 331 | 36 | 81 | 9 |

The opening no longer supplies repeated all-clears as the usual outcome. Greedy first-clear median among successful games moves 3→23; 27/100 v3 greedy games have no all-clear before defeat/cap, versus 5/100 v2. Imperfect players also have fewer full clears (18/100 games with any, versus 46/100); this is a real tradeoff, not evidence that every player receives the desired rhythm. Ordinary line-clear events increase for random/greedy/imperfect, decrease slightly for planner. Human evaluation must decide whether the quieter full-board rewards went too far.

Early random defeats (<12 moves) 1→0 after restoring the safe opening size restriction. Planner deaths 2→1 is too small a sample to claim improvement. Longer survival is not retention or subjective enjoyment.

Recovery follow-up: all 16 eligible v3 greedy games survived 24 more moves; 3/42 imperfect and 62/100 random games died within that horizon. One random recovery ended within three moves. The original tray is retained and is not guaranteed to be completable under arbitrary choices. Recovery comparisons across policy rows are descriptive, not a causal test of the bonus: the death boards differ. Unit tests separately establish exactly three supported refills and one-time grant semantics.

## Layering review
`rhythm-0.39/ring-layering.png` is an explicitly constructed all-clear fixture. Rear ellipse correctly disappears beneath the lower board edge; lower arc stays in front. No extra canvas. Targeted browser tests passed 10/10 including layer order, pointer transparency, pause cleanup, atomic theme/save failure and new-game selection. Unit suite passed 137 tests; production build passed. Full CI/APK evidence follows.

## Final performance check
Simulation workers had all exited before these measurements; no concurrent recording/tests during performance capture. Initial rear-path geometry updates caused 78–85 layout passes in the all-clear/drag window. CSS transform of a fixed root SVG surface reduced this to 26–28 in two repeated final samples (transforming the child path alone did not fix it). Geometry is fixed at spawn; both halves use the same dt/age. See `performance-first-ring.json` and `performance-final-ring.json`.

Final full-clear/rain/drag p95 frame intervals: 33.4 and 50 ms; long tasks 50–97 ms remain. Earlier refill v3 p95 16.8 ms in three samples; idle 16.7–16.8 ms. The final rendering edit affects only the rear all-clear ring. This is software Chromium, not phone FPS, and small samples do not establish a robust frame-rate improvement. Final five flow browser tests passed after the surface change; production build passed. APK source: `87e4c4b6bc5b572f33377dccb00f032c2e3f6d9f`.

## Reproduction
```sh
SIM_SEEDS=100 SIM_OFFSET=40000 SIM_LIMIT=120 SIM_OUT=/tmp/rhythm39-final.json node scripts/audit-rhythm39.mjs
BLOCKY_TAG=ring39-root BLOCKY_REPEATS=2 BLOCKY_MODES=all-clear BLOCKY_DEALER=flow-v3 node scripts/audit-performance39.mjs
node scripts/review-ring39.mjs
CAPTURE_DIR=/tmp/blocky39-capture CAPTURE_SEED=71083554 CAPTURE_MOVES=111 CAPTURE_REVIVE=1 node scripts/record-flow39.mjs
```
Run performance checks after simulations/captures exit. The capture's reward bridge is explicitly mocked and labelled; it does not verify a real ad impression, network callback or physical haptics.

## Ordinary gameplay recording
Final source, seed 71083554 (second greedy held-out seed), selected to show clears and a defeat in one video. 110 ordinary touch moves from an empty board, 212.695 seconds. Full clears on moves 36/39/41/53 (about 1:05/1:12/1:17/1:39); defeat after move 86; explicitly mocked reward at 2:46, followed by 24 more moves. Three recovery refills expire normally; final recoveryDeals=0. No injected mid-game boards or dealer witness. This selected example is not representative of every seed, as the aggregate table shows.

Inspected ordinary buildup, the rain-ring reveal, post-clear material changes and resumed play. Runtime ring screenshot and video use the final SVG-root transform. Live WebAudio capture; physical speaker balance/haptics and real ad callbacks remain outside this recording. Provenance: `rhythm-0.39/natural-gameplay.json`. Frozen v2 function body was also compared byte-for-byte with 0.38 (only export name/signature formatting differ).

## Paired recovery check and rejected variants
Replayed the same 100 v3 seeds for greedy and imperfect players, then forked each eligible defeat: identical deleted zone, remaining tray, score, RNG and player RNG; one arm gets the recovery state, the control retains its pre-revive rhythm. Horizon 24 moves, survivors censored. `recovery-pairs.json` records all pairs. Greedy: 16 pairs, zero defeats in either arm, 384 moves each; all-clears 1 with bonus versus 7 control. Imperfect: 42 pairs, three defeats in each arm, 963 versus 960 moves, no all-clears in either. Thus this sample does NOT demonstrate a meaningful survival gain or a stronger all-clear celebration from the bonus. Three supported refills are implemented, but their subjective benefit remains unproven.

Also tested allowing larger shapes during recovery: greedy defeats increased to 1/16 and imperfect to 7/42; rejected. A temporary v2 handoff likewise produced 1/16 greedy defeats and fewer full clears; rejected before finishing the second strategy. Neither experiment was committed or included in the APK. Retained the bounded, safer original recovery policy; no claim of guaranteed comeback. This limitation is explicit rather than tuning indefinitely on the same small set of defeat boards.

Live-audio file peak −12.6 dBFS; no clipping observed in the capture. This is not subjective phone listening.

## Delivered APK — verified 04.11.2026
CI run 41684249072 and artifact 13255610032 passed. Version 39 / 0.39.0-preview; signing certificate matches 0.38; ZIP CRC and all 76 production files match the local build byte-for-byte. `rhythm-0.39/apk-verification.json` contains the SHA-256 and manifest evidence. Physical Android not tested. The interrupted/resumed 60-cycle soak did not retain a completion report, so no new 60-cycle pass is claimed for 0.39.
