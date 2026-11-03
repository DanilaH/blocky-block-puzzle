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

## Validation in progress
Paired simulation, repeated browser scenarios, natural gameplay, regression suite and signed APK evidence will be appended after completion. Synthetic browser timings are not physical Android measurements. Do not infer phone FPS or subjective feel from functional tests.
