# Preview 0.39 — rhythm and board-wrapping reveal

Baseline: 0.38, f46fab7351104e851c141cb52ebc08a01eea2525. Scope approved by owner: ring layering; quieter opening, buildup/relief cycle, three supported refills after successful revive. No deliberate losing trays or ad-dependent difficulty before defeat.

## Implementation
- Frozen flow-v2 retained for saved games; new default flow-v3. Rhythm is persisted with the move and sent through the existing refill worker.
- Pressure rises by at most 14 per accepted move, falls by at most 18; based on occupancy and a drought of ordinary clears. Crossing 55 starts up to 18 moves of relief, stopped early by all-clear. This holds assistance through ordinary clears so the player can finish cleanup; it is not an all-clear timer or guarantee. All-clear reduces pressure to one quarter.
- Empty board starts with zero deliberate all-clear bonus. Geometric construction and route safety remain; all support levels have a replayable three-piece route or safe singles fallback. Player decisions can still block the remainder.
- Revive retains the visible 3×3 deletion and remaining tray. Its prepared effect includes three recovery refills (support floors 1.0, 0.8, 0.6), consumed on refill rather than by time or single moves. Natural board pressure may provide stronger support. The bonus does not repair arbitrary choices within the old tray; this is measured separately. Duplicate/late rewards keep their existing atomic semantics.
- Falling reveal uses one rear SVG path per active ring beneath the board and the existing foreground canvas for the front arc. Same age, center and radii; pointer events disabled; pause/resize/expiry clear the path. No extra canvas backing store.

## Validation status
Unit/build/browser, held-out balance, visual review and APK evidence are appended after completion. Physical Android and human feel remain unverified for this build.

## Tuning separation
Three exploratory variants on indices 101–130 (seed=index×1777). The first suppressed full clears too much; support stopped as soon as initial lines were cleared. Added limited relief persistence and earlier pressure response. An initial check on indices 30001–30100 exposed more early random-player defeats: restored the v2 early large-piece restriction without restoring its all-clear bonus. Final comparison uses disjoint indices 40001–40100, four independent players, same seeds for v2/v3 and 120-move cap. Optional post-defeat revive follow-up is separate from pre-defeat metrics.
