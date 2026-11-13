# Preview 0.37 — flow, full clear and persistent themes

## Scope
D33 approved after the supplied 7:39 reference. Seven observed theme changes coincide with full clear; no verified evidence of ad-driven assistance withdrawal or post-revive assistance. Implementation is our own, not a recovered competitor algorithm.

- New games use flow-v1. Existing games retain their saved dealer/scoring; legacy weighted policies exclude the six new orientations, preserving their distribution.
- Beam search plans three placements using eight 8-bit rows, width 8, depth 3, deterministic seeded selection. Full clears, lines, fragmentation, fullness and small isolated holes influence ranking. Construction paths are retained beside immediate-clear paths. Early crowded boards restrict shape size; consecutive identical family bags receive a penalty. There is no session-count, rewarded or ad dependency.
- Three-step witness is internal evidence of an available route, not a guarantee after arbitrary player choices. A bounded search may miss a solution; documented fallback is the existing dealer. Third-piece refill runs in a persistent worker; neutral pending feedback precedes atomic save. Initial new-game generation remains synchronous and bounded.
- D3: two diagonal orientations. L5: four rotations of a five-cell corner. Catalogue 31 orientations.
- Full clear updates wardrobe in the same profile transaction as points/board. Eleven curated themes follow a contrasting tour; each is retained and selectable after discovery. Themes do not revert when combo ends, after defeat or on restart. Manual menu selection also persists atomically.
- Six monochrome palette variants on three existing authored materials, 18 additional 128px WebP assets, alpha/gutters verified. Offline luminance remapping of our own atlas, no new third-party art. Preloaded and cached alongside original materials; no theme-time image requests.
- Three all-clear compositions: perimeter/fountains, rising diamond bloom, rain/trails/landing rings. Bound 260 particles / two reveal envelopes; ordinary clear bursts reduced to preserve contrast. Native empty/bloom/rain waveforms and three harmonic theme chimes. Background wave softened; no ordinary-clear full-screen wave.
- Touch lift is immediately 1.2 cells beyond the shape's bottom edge. Mouse and keyboard remain supported. Hint and campaign entry moved to pause; score/record/settings and compact combo remain.
- Music defaults to zero for new profiles; existing chosen settings are preserved. Sound and vibration never run while lifecycle is blocked.

## Evidence
- Unit: 129 passed across 20 files locally and in CI. Dedicated route replay, deterministic save, shape and theme validation tests.
- Browser: final CI 116/116 passed (7.5 min); all-clear save/reload/new game/collection; failed write awards neither theme nor score; actual CDP touch confirms offset and cancellation. Existing advertising/reward gates remain.
- `flow-0.37/simulation.json`: paired seeds, random and one-step greedy players, finite move cap. This is synthetic evidence and does not estimate human retention, session duration or phone FPS.
- `scripts/record-flow37.mjs`: empty seeded board, ordinary deals throughout, automated greedy player through real touch input, live game audio. No injected mid-game positions, no use of dealer's hidden witness. 94.208 seconds, 36 moves, eight full clears; event evidence in `flow-0.37/natural-gameplay.json`. Not a human playtest.
- `scripts/build-theme-tiles.mjs` and `npm run assets:check`: reproducible palette preparation with bounded encode/decode cost.

## Open gates
Source commit `d2d3605bdfd4dabe97cba5790a841bc7fc8fc057`; CI run `41612162238`: assets, 129 unit, build and 116 browser checks passed. Android unit checks and APK build passed. APK version 37 / 0.37.0-preview, package com.danilah.blocky.dev, ZIP CRC, signature continuity with 0.36 and all 76 production files verified. SHA-256 `274df63be0869f26df7427c145048a4b22dd60654d01c82fb791245dbc527565`. Evidence: `flow-0.37/apk-verification.json`. Physical Android installation, frame time, tactile strength, listening and human balance/feel assessment are not verified by browser or simulation. Production ad identifiers, release signing and store publication remain outside this preview.

## Balance and performance limits
Across 60 paired seeds per strategy (120-move cap), random-player early defeats fell from 20 to 3; greedy-player full clears rose from 5 to 368. However greedy-player defeats increased from 27 to 33 and total moves fell from 5,867 to 5,082. This package improves access to clear sequences, not universally survival. Human balance acceptance remains open.

The isolated cloud browser sample (`flow-0.37/browser-performance.json`) still contains long tasks: full-effect drag p95 33.4 ms, idle drag p95 49.9 ms. These short, noisy software-rendered samples are not phone frame rates and do not establish a speedup. They prevent claiming the frame-stall gate is closed. Worker refill, bounded pools and preloaded theme assets reduce known sources of main-thread work; physical profiling remains required.
