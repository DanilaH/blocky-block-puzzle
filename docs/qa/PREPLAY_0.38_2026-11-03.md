# Preview 0.38 — pre-playtest corrections

Source baseline: 8a0c0938feaf643d1819ece4ce5ed24bb1ce7c7b (0.37).

## Implemented
- New games use flow-v2; persisted flow-v1 still runs its unchanged algorithm. No advertising/session-count dependency.
- Search retains the best path to each equivalent board instead of the first path. Repeated-bag penalty reduced from 7,000 (greater than one all-clear) to 180. Rank penalizes pieces unavailable on the initial board; congested boards restrict size earlier. These are soft preferences, not a guarantee for arbitrary play.
- If the bounded search misses a complete route on a non-full board, v2 supplies three singles with a replayable route, instead of falling back to an arbitrary weighted bag. A full board remains unsolvable.
- Classic no longer uploads a blank 512×512 decoration texture on every placement. Campaign decoration remains intact.
- DOM palette images are decoded and retained at startup; festival chips/stars use two blend passes. Counts, durations, sound and haptics remain unchanged.
- Tray geometry is read before DOM writes; calculation and atomic save have separate diagnostic wall-time phases.
- Simultaneous line detection uses row/column masks with preserved result ordering and immutability; shape lookups use an index.

## Validation
CI 41637240796, source 64feb930cb59b79359010845aceb6988e2867ff7: assets, 133 unit tests across 22 files, production build and all 117 browser tests passed. Android unit/build passed; the signed APK and final 8,000 games are recorded below. Synthetic browser timings are not physical Android measurements. Do not infer phone FPS or subjective feel from functional tests.

## Rendering evidence
`preplay-0.38/performance-before.json`: three baseline pages per scenario. `performance-after.json`: two final pages per scenario, run after every simulation worker exited. Baseline p95 ranges versus final: multi-line/drag 33.4–50 → 33.3 ms; all-clear/theme/drag 50 → 33.4 ms; flow-v1 refill/drag 16.8–33.4 → 16.8 ms; idle drag 16.7–33.3 → 16.7–16.8 ms. Separate final flow-v2 refill (`performance-final-v2.json`) is 16.8 ms in both samples. Small samples in Chromium software rendering cannot establish stable 60 FPS or a phone speedup.

Long tasks remain: final multi-line 50–69 ms, all-clear 50–148 ms, v2 refill one 51 ms task. Earlier traces included compositor Commit/GPU work. Early exploratory ablations and intermediate captures overlapped simulations and are excluded from quantitative before/after claims; final isolated results supersede those captures. Disabling individual effect layers did not establish a single cause. `placementWallMs` includes Playwright scheduling, not input latency; calculation/save wall times include worker/IndexedDB scheduling and are not CPU times. Physical Android frame-time verification remains open.

## Visual/lifecycle review
- Three ordinary seeded games, actual CDP touch, live game sound, no injected mid-game boards and no hidden dealer witness: seed 1777, 35 moves / six full clears / defeat; seed 17894390, 26 moves / three full clears / defeat; seed 17782439, 36 recorded moves / four full clears, recording cap. These are automated games, not human playtests.
- Reviewed clear peaks, ordinary drag, monochrome/polychrome materials and defeat. Found competing line/all-clear headlines: the old line now fades out over 160 ms when all-clear takes foreground. Points still settle exactly once; a dedicated browser regression checks the handover and displayed score convergence.
- `preplay-0.38/natural-gameplay.json`: recording event provenance. Delivered video uses source 64feb930cb59b79359010845aceb6988e2867ff7 and natural frame timestamps. Audio peak −14.2 dBFS; no clipping detected, not a subjective listening or phone-speaker test.
- `preplay-0.38/soak.json`: 60 clear/drag/pause/restart cycles, no errors. Final state: zero active effects-clock jobs, sparks, voices or animations; 768 pooled tiles, 1,309 scene children, three canvases. Listener/DOM counts stable after warm-up. Heap rose modestly across the sample; this is not a proof against every leak or a 30-minute phone soak.

## Counterexamples retained
`preplay-0.38/regressions.json` replays three greedy-player regressions where v1 reached the 120-move cap but v2 lost at moves 23/26/26. Each final tray had a separately replayed legal three-move route; the one-step greedy player chose another order/placement and blocked the remainder. The aggregate improvement does not guarantee a forgiving outcome for every seed or arbitrary choice. We do not hide these counterexamples or claim the dealer has solved human balance.

The final planning-player simulation uses an independent three-step beam of width eight, never the dealer witness. Its array-based reference was accelerated with row masks only in the audit harness; 144 generated states produced identical first moves. Each policy uses the same 1,000 seeds and 120-move cap. Simulation calculation wall times are not performance evidence: runs were concurrent and some exploratory runs were interrupted; use the browser phase records instead.

## Final balance sample

1,000 paired seeds per strategy/policy; seed indices 20001–21000 multiplied by 1777, cap 120 moves. Survivors are censored, not completed human sessions. Full per-game records: `preplay-0.38/simulation.json.gz`; aggregates: `simulation-summary.json`.

| Player | Policy | Defeats / 1000 | Total moves | All-clears | Line-clear events |
|---|---|---:|---:|---:|---:|
| random | flow-v1 | 1000 | 19389 | 0 | 3422 |
| random | flow-v2 | 990 | 33908 | 0 | 7023 |
| greedy | flow-v1 | 562 | 92379 | 6555 | 45325 |
| greedy | flow-v2 | 340 | 103707 | 6743 | 49291 |
| imperfect | flow-v1 | 947 | 49043 | 1461 | 22331 |
| imperfect | flow-v2 | 719 | 74271 | 1229 | 32804 |
| planner | flow-v1 | 12 | 119268 | 10245 | 60115 |
| planner | flow-v2 | 11 | 119374 | 10552 | 57619 |

Random early defeats (<12 moves) decreased 26→9. Greedy repeated family bags rose 0→1,236: useful repetition is now allowed. Tradeoff: imperfect-player all-clears decreased 1,461→1,229 despite longer survival and more ordinary clear events. These results support improved aggregate survivability, not universal forgiveness, addictive feel or monetization claims. Existing saved v1 runs retain their old dealer; start a new game to evaluate v2.

## APK and remaining checks

Source `64feb930cb59b79359010845aceb6988e2867ff7`; CI run 41637240796. Package `com.danilah.blocky.dev`, versionCode 38, versionName `0.38.0-preview`. ZIP CRC, signing certificate continuity with 0.37 and all 76 production files verified; see `preplay-0.38/apk-verification.json`. APK SHA-256: `c22774a981b95f4c5716cbb0b16ef0ac6cc7c4275454ed9938806914b2eeaa2e`.

Remaining: real-device frame pacing, tactile/audio feel, subjective balance. Known synthetic long tasks are retained above; this package is not represented as eliminating every hitch. No new art or reduction of effect strength was used to obtain these changes.
