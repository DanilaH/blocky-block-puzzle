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
- Unit: final count to be filled after complete checks. Dedicated route replay, deterministic save, shape and theme validation tests.
- Browser: all-clear save/reload/new game/collection; failed write awards neither theme nor score; actual CDP touch confirms offset and cancellation. Existing advertising/reward gates remain.
- `flow-0.37/simulation.json`: paired seeds, random and one-step greedy players, finite move cap. This is synthetic evidence and does not estimate human retention, session duration or phone FPS.
- `scripts/record-flow37.mjs`: empty seeded board, ordinary deals throughout, automated greedy player through real touch input, live game audio. No injected mid-game positions, no use of dealer's hidden witness. Not a human playtest.
- `scripts/build-theme-tiles.mjs` and `npm run assets:check`: reproducible palette preparation with bounded encode/decode cost.

## Open gates
Full final browser run, CI and signed APK verification will be recorded after completion. Physical Android installation, frame time, tactile strength, listening and human balance/feel assessment are not verified by browser or simulation. Production ad identifiers, release signing and store publication remain outside this preview.
